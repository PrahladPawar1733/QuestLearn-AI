import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ingestFile, sniffType, validateBatch } from "../ingest/files";

async function pdf(pages: number) {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) d.addPage();
  return Buffer.from(await d.save());
}

describe("file ingestion", () => {
  it("identifies types from magic bytes, not names", async () => {
    expect(sniffType(await pdf(1))).toBe("application/pdf");
    expect(sniffType(await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).png().toBuffer())).toBe("image/png");
    expect(sniffType(Buffer.from("hello"))).toBeNull();
  });

  it("accepts a PDF and counts pages", async () => {
    const r = await ingestFile("chapter.pdf", await pdf(3));
    expect(r.pageCount).toBe(3);
  });

  it("rejects a corrupted PDF with a friendly error", async () => {
    await expect(ingestFile("broken.pdf", Buffer.from("%PDF-1.4 garbage"))).rejects.toMatchObject({ code: "PDF_CORRUPT", status: 422 });
  });

  it("rejects unsupported and disguised files", async () => {
    await expect(ingestFile("notes.txt", Buffer.from("hello"))).rejects.toMatchObject({ code: "UNSUPPORTED_TYPE" });
    await expect(ingestFile("fake.png", Buffer.alloc(500, 7))).rejects.toMatchObject({ code: "UNSUPPORTED_TYPE" });
  });

  it("auto-orients and resizes large photos, keeping enough resolution", async () => {
    const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#eee" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const r = await ingestFile("photo.jpg", big);
    expect(r.processed).toBeDefined();
    // EXIF orientation 6 = rotate 90°, so portrait after orientation; long edge capped at 2400
    expect(r.width).toBe(1800);
    expect(r.height).toBe(2400);
  });

  it("rejects tiny images and oversize batches", async () => {
    const tiny = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#fff" } }).png().toBuffer();
    await expect(ingestFile("tiny.png", tiny)).rejects.toMatchObject({ code: "IMAGE_TOO_SMALL" });
    expect(() => validateBatch([{ name: "a.pdf", size: 11 * 1024 * 1024 }])).toThrow(/larger than/);
    expect(() => validateBatch([])).toThrow(/at least one/);
  });
});
