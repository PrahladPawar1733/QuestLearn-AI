/**
 * getUserMedia wrapper for the notes camera.
 *
 * Every failure mode here is something a student will actually hit (permission
 * tapped away, another app holding the camera, an http:// preview URL), and
 * each needs a different instruction — so the raw DOMException names are
 * classified once, here, instead of in the UI.
 */
import { AppError } from "../errors";
import { createSurface, surfaceToBlob } from "./canvas";

export type CameraErrorKind = "denied" | "no-device" | "in-use" | "insecure-context" | "unsupported" | "unknown";

export type FacingMode = "environment" | "user";

/** Student-facing copy per failure kind; the UI should not invent its own. */
export const CAMERA_ERROR_MESSAGES: Readonly<Record<CameraErrorKind, string>> = {
  denied: "Camera access is blocked. Allow the camera in your browser settings, then try again — or upload a photo instead.",
  "no-device": "We couldn't find a camera on this device. You can upload a photo of your notes instead.",
  "in-use": "Another app is using the camera. Close it and try again.",
  "insecure-context": "The camera only works on a secure (https) connection. Open this page over https or upload a photo instead.",
  unsupported: "This browser can't open the camera. Try Chrome or Safari, or upload a photo instead.",
  unknown: "The camera didn't start. Try again, or upload a photo of your notes instead.",
};

/** Carries the failure kind alongside the app's normal error contract. */
export class CameraError extends AppError {
  constructor(
    public readonly kind: CameraErrorKind,
    public readonly cause?: unknown,
  ) {
    // Retryable for the transient kinds only: a blocked permission will not fix
    // itself by pressing the button again.
    super(`CAMERA_${kind.toUpperCase().replace(/-/g, "_")}`, CAMERA_ERROR_MESSAGES[kind], 400, kind === "in-use" || kind === "unknown");
    this.name = "CameraError";
  }
}

/**
 * Map a getUserMedia rejection onto a kind. Pure, so the mapping is testable
 * without a browser.
 */
export function classifyCameraError(err: unknown): CameraErrorKind {
  if (err instanceof CameraError) return err.kind;
  const name = typeof err === "object" && err !== null && "name" in err ? String((err as { name: unknown }).name) : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "PermissionDismissedError":
    case "SecurityError":
      return "denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      // Over-constrained means the requested camera (e.g. the rear one) does not exist.
      return "no-device";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "in-use";
    case "TypeError":
      // getUserMedia throws TypeError when the constraints object is unusable
      // or the API is absent behind a polyfill.
      return "unsupported";
    default:
      return "unknown";
  }
}

export interface CameraSupport {
  supported: boolean;
  reason?: CameraErrorKind;
}

/** Whether this environment can open a camera at all, and why not if it cannot. */
export function hasCameraSupport(): CameraSupport {
  if (typeof navigator === "undefined" || typeof window === "undefined") return { supported: false, reason: "unsupported" };
  // Browsers hide mediaDevices entirely on insecure origins, so check context first.
  if (window.isSecureContext === false) return { supported: false, reason: "insecure-context" };
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    return { supported: false, reason: "unsupported" };
  }
  return { supported: true };
}

export interface CameraInfo {
  deviceId: string;
  /** Empty until the user has granted permission once — the UI must cope with that. */
  label: string;
  facingMode?: FacingMode;
}

export interface StartOptions {
  facingMode?: FacingMode;
  /** Pin a specific camera from `listCameras()`; wins over `facingMode`. */
  deviceId?: string;
  /** Requested capture size; the browser is free to give us less. */
  idealWidth?: number;
  idealHeight?: number;
}

// `torch` is standard in MediaTrackSettings but missing from the capability and
// constraint lib types, so these two shapes stand in for the missing members.
type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean | boolean[] };
type TorchConstraint = MediaTrackConstraintSet & { torch?: boolean };

// `grabFrame` is in the Image Capture spec and ships in Chromium, but is absent
// from lib.dom; optional here because the whole interface may be missing.
type FrameGrabber = ImageCapture & { grabFrame?: () => Promise<ImageBitmap> };

/**
 * One live camera stream and the operations the capture UI needs from it.
 * The caller owns the `<video>` element; pass it in so photo capture can fall
 * back to grabbing the displayed frame.
 */
export class CameraSession {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private facing: FacingMode = "environment";
  private deviceId: string | undefined;
  private torchOn = false;

  /** The live stream, for the UI to attach to a `<video>`. */
  get mediaStream(): MediaStream | null {
    return this.stream;
  }

  get facingMode(): FacingMode {
    return this.facing;
  }

  get isTorchOn(): boolean {
    return this.torchOn;
  }

  get track(): MediaStreamTrack | null {
    return this.stream?.getVideoTracks()[0] ?? null;
  }

  /** Register the preview element used as the fallback frame source. */
  setVideoElement(el: HTMLVideoElement | null): void {
    this.video = el;
  }

  /** Open a camera stream, replacing any current one. Throws `CameraError`. */
  async start(opts: StartOptions = {}): Promise<MediaStream> {
    const support = hasCameraSupport();
    if (!support.supported) throw new CameraError(support.reason ?? "unsupported");

    this.stop();
    this.facing = opts.facingMode ?? this.facing;
    this.deviceId = opts.deviceId ?? this.deviceId;

    const video: MediaTrackConstraints = {
      width: { ideal: opts.idealWidth ?? 1920 },
      height: { ideal: opts.idealHeight ?? 1080 },
    };
    // deviceId must be exact to pin a camera; facingMode stays "ideal" so a
    // laptop with only a front camera still opens instead of failing.
    if (opts.deviceId) video.deviceId = { exact: opts.deviceId };
    else video.facingMode = { ideal: this.facing };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (e) {
      throw new CameraError(classifyCameraError(e), e);
    }
    try {
      this.stream = stream;
      this.torchOn = false;
      const settings = stream.getVideoTracks()[0]?.getSettings();
      if (settings?.facingMode === "user" || settings?.facingMode === "environment") this.facing = settings.facingMode;
      if (settings?.deviceId) this.deviceId = settings.deviceId;
      return stream;
    } catch (e) {
      // Never leave a granted stream running if post-start bookkeeping fails.
      for (const t of stream.getTracks()) t.stop();
      this.stream = null;
      throw new CameraError(classifyCameraError(e), e);
    }
  }

  /** Stop every track and drop the stream. Safe to call repeatedly. */
  stop(): void {
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
    }
    this.stream = null;
    this.torchOn = false;
  }

  /** Flip between front and rear cameras, reopening the stream. */
  async switchCamera(): Promise<MediaStream> {
    const next: FacingMode = this.facing === "environment" ? "user" : "environment";
    // Drop the pinned deviceId, otherwise it would override the new facingMode.
    this.deviceId = undefined;
    return this.start({ facingMode: next });
  }

  /** List video inputs so the UI can offer a camera picker. */
  async listCameras(): Promise<CameraInfo[]> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((d) => d.kind === "videoinput")
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label,
          // Labels are the only hint available before a stream is open.
          facingMode: /back|rear|environment/i.test(d.label)
            ? ("environment" as const)
            : /front|face|user/i.test(d.label)
              ? ("user" as const)
              : undefined,
        }));
    } catch {
      return [];
    }
  }

  /** Whether the active track exposes a torch, so the UI can hide the button. */
  hasTorch(): boolean {
    const track = this.track;
    if (!track || typeof track.getCapabilities !== "function") return false;
    try {
      const caps = track.getCapabilities() as TorchCapabilities;
      return Array.isArray(caps.torch) ? caps.torch.includes(true) : caps.torch === true;
    } catch {
      return false;
    }
  }

  /** Turn the torch on or off; returns the state actually achieved. */
  async setTorch(on: boolean): Promise<boolean> {
    const track = this.track;
    if (!track || !this.hasTorch()) return false;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as TorchConstraint] });
      this.torchOn = on;
      return on;
    } catch {
      return this.torchOn;
    }
  }

  /** Toggle the torch, reporting the resulting state. */
  async toggleTorch(): Promise<boolean> {
    return this.setTorch(!this.torchOn);
  }

  /**
   * Take a still. Prefers `ImageCapture.takePhoto`, which uses the full sensor
   * resolution rather than the downscaled preview, and falls back to grabbing a
   * frame when that is missing (Safari/Firefox) or rejects.
   */
  async capturePhoto(): Promise<Blob> {
    const track = this.track;
    if (!track || track.readyState !== "live") throw new CameraError("in-use");

    if (typeof ImageCapture !== "undefined") {
      try {
        const capture = new ImageCapture(track);
        return await capture.takePhoto();
      } catch {
        try {
          const grabber = new ImageCapture(track) as FrameGrabber;
          if (!grabber.grabFrame) throw new Error("grabFrame unavailable");
          const bitmap = await grabber.grabFrame();
          try {
            return await this.drawToBlob(bitmap, bitmap.width, bitmap.height);
          } finally {
            bitmap.close();
          }
        } catch {
          // Both ImageCapture paths failed; fall through to the preview element.
        }
      }
    }

    const video = this.video;
    if (!video || !video.videoWidth || !video.videoHeight) throw new CameraError("unsupported");
    return this.drawToBlob(video, video.videoWidth, video.videoHeight);
  }

  private async drawToBlob(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
    const surface = createSurface(width, height);
    surface.ctx.drawImage(source, 0, 0, width, height);
    // JPEG at 0.92: the frame is re-encoded by normalizeImage anyway, so this
    // stage only needs to avoid adding visible artefacts.
    return surfaceToBlob(surface, "image/jpeg", 0.92);
  }
}
