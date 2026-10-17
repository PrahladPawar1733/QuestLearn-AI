import { describe, expect, it } from "vitest";
import { config } from "../../config";
import { CAPTURE_LIMITS, MIN_IMAGE_EDGE, SERVER_ACCEPTED_IMAGE_TYPES } from "../limits";
import { hasCanvasSupport, createSurface, resetWebpProbe, supportsWebpEncode } from "../canvas";
import { preferredMime } from "../image";

describe("client limits mirror the server", () => {
  it("matches config.limits exactly", () => {
    // The capture pipeline cannot import the server-only config, so this is the
    // guard that keeps the duplicated numbers from drifting apart.
    expect(CAPTURE_LIMITS.maxFileBytes).toBe(config.limits.maxFileBytes);
    expect(CAPTURE_LIMITS.maxTotalBytes).toBe(config.limits.maxTotalBytes);
    expect(CAPTURE_LIMITS.maxFiles).toBe(config.limits.maxFiles);
    expect(CAPTURE_LIMITS.maxImageEdge).toBe(config.limits.maxImageEdge);
  });

  it("agrees with the server's magic-byte sniffer and minimum edge", () => {
    expect([...SERVER_ACCEPTED_IMAGE_TYPES]).toEqual(["image/jpeg", "image/png"]);
    expect(MIN_IMAGE_EDGE).toBe(200);
  });
});

describe("canvas environment guards", () => {
  it("reports no canvas support outside a browser", () => {
    expect(hasCanvasSupport()).toBe(false);
    expect(() => createSurface(10, 10)).toThrow(/canvas/i);
  });

  it("falls back to JPEG when the WebP probe cannot run", async () => {
    resetWebpProbe();
    await expect(supportsWebpEncode()).resolves.toBe(false);
    await expect(preferredMime()).resolves.toBe("image/jpeg");
    // A forced type is always honoured, probe or not.
    await expect(preferredMime("image/webp")).resolves.toBe("image/webp");
    resetWebpProbe();
  });
});
