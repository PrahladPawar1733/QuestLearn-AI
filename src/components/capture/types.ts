/**
 * The shape the capture UI passes around: one photographed page, already
 * normalized to something the upload route will accept.
 */
import type { ImageQuality } from "@/lib/capture";

/** Where the bytes came from, so the UI can word retakes honestly. */
export type PageSource = "camera" | "capture-input" | "file";

export interface CapturedPage {
  id: string;
  /** Upload-ready bytes: EXIF applied, long edge capped, under the per-file limit. */
  file: File;
  /** Object URL of `file`. The owner of the page must revoke it — see `revokePage`. */
  url: string;
  width: number;
  height: number;
  bytes: number;
  /** `null` when the check could not run (no canvas), never "assumed fine". */
  quality: ImageQuality | null;
  /** The student was shown a warning about this page and kept it anyway. */
  kept: boolean;
  source: PageSource;
  /** The byte budget search could not get under the per-file limit. */
  overBudget: boolean;
  /** Smaller than the server's 200 px floor, so it would be rejected on upload. */
  tooSmall: boolean;
}

/** Release the preview URL. Safe to call twice; safe outside a browser. */
export function revokePage(page: Pick<CapturedPage, "url"> | null | undefined): void {
  if (!page?.url) return;
  if (typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;
  URL.revokeObjectURL(page.url);
}

/** Release a whole batch (cancelling a capture session, unmounting a list). */
export function revokePages(pages: readonly Pick<CapturedPage, "url">[]): void {
  for (const p of pages) revokePage(p);
}
