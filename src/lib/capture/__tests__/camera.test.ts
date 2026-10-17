import { afterEach, describe, expect, it, vi } from "vitest";
import { CAMERA_ERROR_MESSAGES, CameraError, CameraSession, classifyCameraError, hasCameraSupport } from "../camera";

/** DOMException is not constructible with arbitrary names in every runtime, so fake the only field read. */
const err = (name: string) => ({ name, message: name });

interface FakeTrack {
  kind: string;
  readyState: string;
  stop: () => void;
  getSettings: () => MediaTrackSettings;
}

function fakeStream(tracks: FakeTrack[]) {
  // Casting a hand-rolled stub: node has no MediaStream, and only these three
  // members are touched by CameraSession.
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
  } as unknown as MediaStream;
}

function fakeTrack(settings: MediaTrackSettings = {}): FakeTrack & { stopped: boolean } {
  const t = {
    kind: "video",
    readyState: "live",
    stopped: false,
    stop() {
      t.stopped = true;
      t.readyState = "ended";
    },
    getSettings: () => settings,
  };
  return t;
}

/** Install a minimal secure-context browser global set. */
function stubBrowser(getUserMedia: (c: MediaStreamConstraints) => Promise<MediaStream>, devices: MediaDeviceInfo[] = []) {
  vi.stubGlobal("window", { isSecureContext: true });
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia, enumerateDevices: async () => devices },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("classifyCameraError", () => {
  it("maps the DOMException names browsers actually throw", () => {
    expect(classifyCameraError(err("NotAllowedError"))).toBe("denied");
    expect(classifyCameraError(err("PermissionDeniedError"))).toBe("denied");
    expect(classifyCameraError(err("SecurityError"))).toBe("denied");
    expect(classifyCameraError(err("NotFoundError"))).toBe("no-device");
    expect(classifyCameraError(err("DevicesNotFoundError"))).toBe("no-device");
    expect(classifyCameraError(err("OverconstrainedError"))).toBe("no-device");
    expect(classifyCameraError(err("NotReadableError"))).toBe("in-use");
    expect(classifyCameraError(err("TrackStartError"))).toBe("in-use");
    expect(classifyCameraError(err("AbortError"))).toBe("in-use");
    expect(classifyCameraError(new TypeError("bad constraints"))).toBe("unsupported");
  });

  it("falls back to unknown for anything unrecognised", () => {
    expect(classifyCameraError(new Error("boom"))).toBe("unknown");
    expect(classifyCameraError(null)).toBe("unknown");
    expect(classifyCameraError("nope")).toBe("unknown");
    expect(classifyCameraError(undefined)).toBe("unknown");
  });

  it("passes an already-classified error straight through", () => {
    expect(classifyCameraError(new CameraError("insecure-context"))).toBe("insecure-context");
  });
});

describe("CameraError", () => {
  it("carries a student-facing message and a stable code for every kind", () => {
    for (const kind of Object.keys(CAMERA_ERROR_MESSAGES) as (keyof typeof CAMERA_ERROR_MESSAGES)[]) {
      const e = new CameraError(kind);
      expect(e.userMessage).toBe(CAMERA_ERROR_MESSAGES[kind]);
      expect(e.userMessage).not.toMatch(/undefined|error:/i);
      expect(e.code).toMatch(/^CAMERA_[A-Z_]+$/);
      expect(e.name).toBe("CameraError");
    }
    expect(new CameraError("denied").retryable).toBe(false);
    expect(new CameraError("in-use").retryable).toBe(true);
  });
});

describe("hasCameraSupport", () => {
  it("reports unsupported with no browser globals (SSR)", () => {
    vi.stubGlobal("navigator", undefined);
    vi.stubGlobal("window", undefined);
    expect(hasCameraSupport()).toEqual({ supported: false, reason: "unsupported" });
  });

  it("reports the insecure context before anything else", () => {
    vi.stubGlobal("window", { isSecureContext: false });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: () => Promise.resolve() } });
    expect(hasCameraSupport()).toEqual({ supported: false, reason: "insecure-context" });
  });

  it("reports unsupported when getUserMedia is missing", () => {
    vi.stubGlobal("window", { isSecureContext: true });
    vi.stubGlobal("navigator", { mediaDevices: {} });
    expect(hasCameraSupport()).toEqual({ supported: false, reason: "unsupported" });
  });

  it("reports supported on a normal secure page", () => {
    stubBrowser(async () => fakeStream([fakeTrack()]));
    expect(hasCameraSupport()).toEqual({ supported: true });
  });
});

describe("CameraSession", () => {
  it("opens a stream and adopts the camera the browser actually gave us", async () => {
    const constraints: MediaStreamConstraints[] = [];
    stubBrowser(async (c) => {
      constraints.push(c);
      return fakeStream([fakeTrack({ facingMode: "user", deviceId: "cam-1" })]);
    });
    const session = new CameraSession();
    await session.start({ facingMode: "environment" });
    expect(session.mediaStream).not.toBeNull();
    // facingMode stays "ideal" so a front-camera-only laptop still opens.
    expect(constraints[0].video).toMatchObject({ facingMode: { ideal: "environment" } });
    expect(session.facingMode).toBe("user");
  });

  it("pins a chosen camera exactly and drops facingMode", async () => {
    const constraints: MediaStreamConstraints[] = [];
    stubBrowser(async (c) => {
      constraints.push(c);
      return fakeStream([fakeTrack()]);
    });
    await new CameraSession().start({ deviceId: "cam-7" });
    expect(constraints[0].video).toMatchObject({ deviceId: { exact: "cam-7" } });
    expect(constraints[0].video).not.toHaveProperty("facingMode");
  });

  it("throws a classified CameraError and leaves no stream behind", async () => {
    stubBrowser(async () => {
      throw err("NotReadableError");
    });
    const session = new CameraSession();
    await expect(session.start()).rejects.toMatchObject({ kind: "in-use", code: "CAMERA_IN_USE" });
    expect(session.mediaStream).toBeNull();
  });

  it("refuses to start in an insecure context without calling getUserMedia", async () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal("window", { isSecureContext: false });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    await expect(new CameraSession().start()).rejects.toMatchObject({ kind: "insecure-context" });
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("stops the granted stream if post-start bookkeeping fails", async () => {
    const track = fakeTrack();
    const broken = {
      getTracks: () => [track],
      getVideoTracks: () => {
        throw new Error("detached");
      },
    } as unknown as MediaStream;
    stubBrowser(async () => broken);
    const session = new CameraSession();
    await expect(session.start()).rejects.toBeInstanceOf(CameraError);
    expect(track.stopped).toBe(true);
    expect(session.mediaStream).toBeNull();
  });

  it("stops every track on stop() and is safe to call twice", async () => {
    const track = fakeTrack();
    stubBrowser(async () => fakeStream([track]));
    const session = new CameraSession();
    await session.start();
    session.stop();
    session.stop();
    expect(track.stopped).toBe(true);
    expect(session.mediaStream).toBeNull();
    expect(session.isTorchOn).toBe(false);
  });

  it("stops the previous stream when restarting or switching camera", async () => {
    const tracks = [fakeTrack({ facingMode: "environment" }), fakeTrack({ facingMode: "user" })];
    let i = 0;
    stubBrowser(async () => fakeStream([tracks[i++]]));
    const session = new CameraSession();
    await session.start({ facingMode: "environment" });
    await session.switchCamera();
    expect(tracks[0].stopped).toBe(true);
    expect(tracks[1].stopped).toBe(false);
    expect(session.facingMode).toBe("user");
  });

  it("lists video inputs and guesses facing from the label", async () => {
    const devices = [
      { kind: "videoinput", deviceId: "a", label: "Back Camera" },
      { kind: "videoinput", deviceId: "b", label: "FaceTime HD" },
      { kind: "videoinput", deviceId: "c", label: "" },
      { kind: "audioinput", deviceId: "d", label: "Mic" },
    ] as MediaDeviceInfo[];
    stubBrowser(async () => fakeStream([fakeTrack()]), devices);
    const cams = await new CameraSession().listCameras();
    expect(cams.map((c) => c.deviceId)).toEqual(["a", "b", "c"]);
    expect(cams[0].facingMode).toBe("environment");
    expect(cams[1].facingMode).toBe("user");
    // No label (pre-permission) must not be guessed at.
    expect(cams[2].facingMode).toBeUndefined();
  });

  it("returns no cameras instead of throwing when enumeration fails", async () => {
    vi.stubGlobal("window", { isSecureContext: true });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: async () => fakeStream([]),
        enumerateDevices: async () => {
          throw new Error("blocked");
        },
      },
    });
    await expect(new CameraSession().listCameras()).resolves.toEqual([]);
  });

  it("reports no torch when the track cannot describe its capabilities", async () => {
    stubBrowser(async () => fakeStream([fakeTrack()]));
    const session = new CameraSession();
    await session.start();
    expect(session.hasTorch()).toBe(false);
    await expect(session.setTorch(true)).resolves.toBe(false);
    expect(session.isTorchOn).toBe(false);
  });

  it("applies the torch constraint when the track supports it", async () => {
    const applied: MediaTrackConstraints[] = [];
    const track = {
      ...fakeTrack(),
      getCapabilities: () => ({ torch: true }),
      applyConstraints: async (c: MediaTrackConstraints) => {
        applied.push(c);
      },
    };
    stubBrowser(async () => fakeStream([track]));
    const session = new CameraSession();
    await session.start();
    expect(session.hasTorch()).toBe(true);
    await expect(session.toggleTorch()).resolves.toBe(true);
    expect(applied[0]).toEqual({ advanced: [{ torch: true }] });
    await expect(session.toggleTorch()).resolves.toBe(false);
    expect(session.isTorchOn).toBe(false);
  });

  it("keeps the last known torch state when applyConstraints rejects", async () => {
    const track = {
      ...fakeTrack(),
      getCapabilities: () => ({ torch: [true, false] }),
      applyConstraints: async () => {
        throw new Error("not supported after all");
      },
    };
    stubBrowser(async () => fakeStream([track]));
    const session = new CameraSession();
    await session.start();
    await expect(session.setTorch(true)).resolves.toBe(false);
    expect(session.isTorchOn).toBe(false);
  });

  it("refuses to capture without a live track", async () => {
    const track = fakeTrack();
    stubBrowser(async () => fakeStream([track]));
    const session = new CameraSession();
    await session.start();
    session.stop();
    await expect(session.capturePhoto()).rejects.toMatchObject({ kind: "in-use" });
  });

  it("prefers ImageCapture.takePhoto for the full-resolution still", async () => {
    const photo = new Blob([new Uint8Array(8)], { type: "image/jpeg" });
    class FakeImageCapture {
      constructor(public track: MediaStreamTrack) {}
      async takePhoto() {
        return photo;
      }
    }
    vi.stubGlobal("ImageCapture", FakeImageCapture);
    stubBrowser(async () => fakeStream([fakeTrack()]));
    const session = new CameraSession();
    await session.start();
    await expect(session.capturePhoto()).resolves.toBe(photo);
  });

  it("reports unsupported when every capture path is unavailable", async () => {
    class FailingImageCapture {
      constructor(public track: MediaStreamTrack) {}
      async takePhoto(): Promise<Blob> {
        throw new Error("not implemented");
      }
    }
    vi.stubGlobal("ImageCapture", FailingImageCapture);
    stubBrowser(async () => fakeStream([fakeTrack()]));
    const session = new CameraSession();
    await session.start();
    // No <video> registered and no grabFrame, so there is nothing left to draw.
    await expect(session.capturePhoto()).rejects.toMatchObject({ kind: "unsupported" });
  });
});
