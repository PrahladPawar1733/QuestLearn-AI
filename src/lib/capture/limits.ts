/**
 * Client-side mirror of `config.limits`.
 *
 * `src/lib/config.ts` is `import "server-only"`, so it cannot be pulled into a
 * browser bundle. These values are duplicated deliberately and guarded by a
 * test that imports the real config and asserts they still agree, so the camera
 * UI rejects a photo for the same reasons the upload route would.
 */
export const CAPTURE_LIMITS = {
  maxFileBytes: 10 * 1024 * 1024,
  maxTotalBytes: 40 * 1024 * 1024,
  maxFiles: 20,
  maxImageEdge: 2400,
} as const;

/** Types the server's magic-byte sniffer accepts, so we never encode something it will reject. */
export const SERVER_ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"] as const;

/**
 * Smallest edge the server accepts (`ingestFile` throws IMAGE_TOO_SMALL under
 * 200 px), exposed so the UI can warn before an upload round-trip.
 */
export const MIN_IMAGE_EDGE = 200;
