import "server-only";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { config } from "../config";
import { AppError } from "../errors";

export type DetectedType = "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | "image/avif";

/**
 * Formats we can name but cannot decode, so the student gets an instruction
 * instead of "isn't a supported file".
 */
export type RecognisedUnsupportedType = "image/heic";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Brands that mean "HEVC-coded HEIF", i.e. an iPhone photo. `mif1`/`msf1` are
 * the generic HEIF brands and are only reached when no AVIF brand is present,
 * so a `.avif` file (major brand `avif`, compatible brand `mif1`) is not caught
 * here.
 */
const HEIC_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "hevm", "hevs", "mif1", "msf1"]);
const AVIF_BRANDS = new Set(["avif", "avis"]);

/**
 * Brands of an ISO base media file (`ftyp` box): the major brand plus the
 * compatible-brand list. Capped at 16 brands — beyond that the box is either
 * damaged or hostile, and we only need the first few.
 */
function ftypBrands(buf: Buffer): string[] {
  if (buf.length < 12 || buf.subarray(4, 8).toString("latin1") !== "ftyp") return [];
  const boxSize = buf.readUInt32BE(0);
  // The brand list ends at the box boundary, which must stay inside the buffer.
  const end = Math.min(buf.length, boxSize > 8 ? boxSize : buf.length, 8 + 4 + 16 * 4);
  const brands: string[] = [];
  for (let at = 8; at + 4 <= end; at += 4) {
    if (at === 12) continue; // bytes 12-16 are the minor version, not a brand
    brands.push(buf.subarray(at, at + 4).toString("latin1").toLowerCase());
  }
  return brands;
}

/** Identify file type from magic bytes. The browser-supplied MIME type is not trusted. */
export function sniffType(buf: Buffer): DetectedType | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_MAGIC)) return "image/png";
  // WebP is a RIFF container: "RIFF" <4-byte size> "WEBP". The capture pipeline
  // encodes WebP by default (it is ~25-30% smaller than JPEG on photographed
  // text), so without this every camera upload came back 415.
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  // AVIF is HEIF with an AV1 payload, and the bundled libvips *can* decode it
  // (`sharp.format.heif.input.fileSuffix` is `[".avif"]`).
  if (ftypBrands(buf).some((b) => AVIF_BRANDS.has(b))) return "image/avif";
  return null;
}

/**
 * Recognise an image we cannot process, for a specific error message.
 *
 * HEIC is the default iPhone camera format, so "not a supported file" is the
 * single most confusing rejection this app can produce. We cannot simply accept
 * it: sharp's prebuilt libvips reads the HEIF *container* but has no HEVC
 * decoder (verified — `sharp(heic).metadata()` succeeds, then `.toBuffer()`
 * fails with "Support for this compression format has not been built in: HEVC
 * (a suitable decoder plugin is libde265)"), and shipping libde265 means both a
 * native build and the HEVC patent question. So the server names the format and
 * tells the student the two ways out; see `ingestFile` for the copy.
 */
export function sniffUnsupported(buf: Buffer): RecognisedUnsupportedType | null {
  const brands = ftypBrands(buf);
  if (brands.length === 0 || brands.some((b) => AVIF_BRANDS.has(b))) return null;
  return brands.some((b) => HEIC_BRANDS.has(b)) ? "image/heic" : null;
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
    if (sniffUnsupported(buf) === "image/heic") {
      // Two routes out, both one tap away, most specific first: the in-app
      // camera re-encodes every shot to WebP/JPEG before it is uploaded, and
      // the iPhone setting fixes the camera roll for good.
      throw new AppError(
        "HEIC_UNSUPPORTED",
        `"${name}" is an iPhone HEIC photo, which we can't open here. Use the camera button on this page (it converts photos automatically), or switch iPhone Settings › Camera › Formats to "Most Compatible" and take the photo again.`,
        415,
      );
    }
    throw new AppError("UNSUPPORTED_TYPE", `"${name}" isn't a supported file. Use PDF, JPG, PNG or WebP.`, 415);
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
