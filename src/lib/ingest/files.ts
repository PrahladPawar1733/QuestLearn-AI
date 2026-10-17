import "server-only";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { config } from "../config";
import { AppError } from "../errors";

export type DetectedType = "application/pdf" | "image/jpeg" | "image/png";

/** Identify file type from magic bytes. The browser-supplied MIME type is not trusted. */
export function sniffType(buf: Buffer): DetectedType | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}

export interface IngestedFile {
  name: string;
  type: DetectedType;
  original: Buffer;
  processed?: Buffer; // oriented + resized JPEG for images
  pageCount?: number;
  width?: number;
  height?: number;
}

export function validateBatch(files: { name: string; size: number }[]) {
  if (files.length === 0) throw new AppError("NO_FILES", "Add at least one photo or PDF of your notes.", 400);
  if (files.length > config.limits.maxFiles)
    throw new AppError("TOO_MANY_FILES", `You can upload up to ${config.limits.maxFiles} files at a time.`, 400);
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > config.limits.maxTotalBytes)
    throw new AppError("TOO_LARGE", `Your upload is over ${config.limits.maxTotalBytes / 1024 / 1024} MB in total. Try fewer or smaller files.`, 413);
  for (const f of files) {
    if (f.size > config.limits.maxFileBytes)
      throw new AppError("FILE_TOO_LARGE", `"${f.name}" is larger than ${config.limits.maxFileBytes / 1024 / 1024} MB.`, 413);
    if (f.size === 0) throw new AppError("EMPTY_FILE", `"${f.name}" is empty.`, 400);
  }
}

export async function ingestFile(name: string, buf: Buffer): Promise<IngestedFile> {
  const type = sniffType(buf);
  if (!type) {
    throw new AppError("UNSUPPORTED_TYPE", `"${name}" isn't a supported file. Use PDF, JPG or PNG.`, 415);
  }
  if (type === "application/pdf") {
    let pageCount: number;
    try {
      const doc = await PDFDocument.load(buf, { updateMetadata: false });
      // pdf-lib parses lazily: a damaged page tree only fails here.
      pageCount = doc.getPageCount();
    } catch (e) {
      const msg = String((e as Error).message).toLowerCase();
      if (msg.includes("encrypt"))
        throw new AppError("PDF_ENCRYPTED", `"${name}" is password-protected. Please upload an unlocked copy.`, 422);
      throw new AppError("PDF_CORRUPT", `"${name}" looks damaged and can't be opened. Try exporting it again.`, 422);
    }
    if (pageCount === 0) throw new AppError("PDF_EMPTY", `"${name}" has no pages.`, 422);
    if (pageCount > config.limits.maxPdfPages)
      throw new AppError("PDF_TOO_LONG", `"${name}" has ${pageCount} pages. Please upload one chapter (up to ${config.limits.maxPdfPages} pages).`, 422);
    return { name, type, original: buf, pageCount };
  }
  try {
    const img = sharp(buf, { failOn: "error" });
    const meta = await img.metadata();
    if (!meta.width || !meta.height) throw new Error("no dimensions");
    if (meta.width < 200 || meta.height < 200)
      throw new AppError("IMAGE_TOO_SMALL", `"${name}" is too small to read. Upload a photo at least 200 px across.`, 422);
    // Auto-orient from EXIF, cap the long edge, keep enough resolution for handwriting.
    const { data, info } = await sharp(buf)
      .rotate()
      .resize({ width: config.limits.maxImageEdge, height: config.limits.maxImageEdge, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { name, type, original: buf, processed: data, width: info.width, height: info.height };
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("IMAGE_CORRUPT", `"${name}" looks damaged and can't be opened.`, 422);
  }
}
