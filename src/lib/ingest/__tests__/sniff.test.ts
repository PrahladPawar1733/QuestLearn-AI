import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ingestFile, sniffType, sniffUnsupported } from "../files";

const SOLID = { create: { width: 600, height: 400, channels: 3 as const, background: "#dde6f0" } };

/**
 * Minimal but structurally real ISO-BMFF header, the way a phone writes one:
 * `[size]["ftyp"][major brand][minor version][compatible brands…]`.
 */
function ftyp(major: string, compatible: string[] = []): Buffer {
  const brands = [major, "\0\0\0\0", ...compatible].map((b) => Buffer.from(b.padEnd(4, " ").slice(0, 4), "latin1"));
  const body = Buffer.concat(brands);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(8 + body.length);
  // Trailing bytes stand in for the real payload, which we never reach.
  return Buffer.concat([size, Buffer.from("ftyp", "latin1"), body, Buffer.alloc(64, 1)]);
}

describe("sniffType", () => {
  it("accepts WebP, which the capture pipeline produces by default", async () => {
    // The client prefers WebP (~25-30% smaller than JPEG on photographed
    // text). Before this, every normalized camera upload was rejected 415.
    const webp = await sharp(SOLID).webp().toBuffer();
    expect(webp.subarray(0, 4).toString("latin1")).toBe("RIFF");
    expect(sniffType(webp)).toBe("image/webp");
  });

  it("does not mistake another RIFF container for WebP", () => {
    // RIFF carries WAV and AVI too; only the WEBP form code may pass.
    const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVEfmt ")]);
    expect(sniffType(wav)).toBeNull();
  });

  it("accepts AVIF, which the bundled libvips can actually decode", async () => {
    const avif = await sharp(SOLID).avif().toBuffer();
    expect(sniffType(avif)).toBe("image/avif");
    // ...and does not then report it as the undecodable HEIC sibling, even
    // though AVIF files also carry the generic `mif1` HEIF brand.
    expect(sniffUnsupported(avif)).toBeNull();
  });

  it("still recognises PDF, JPEG and PNG, and still rejects junk", async () => {
    expect(sniffType(Buffer.from("%PDF-1.7\n"))).toBe("application/pdf");
    expect(sniffType(await sharp(SOLID).jpeg().toBuffer())).toBe("image/jpeg");
    expect(sniffType(await sharp(SOLID).png().toBuffer())).toBe("image/png");
    expect(sniffType(Buffer.from("hello"))).toBeNull();
    expect(sniffType(Buffer.alloc(0))).toBeNull();
  });
});

describe("sniffUnsupported (HEIC)", () => {
  it("names every HEVC-coded HEIF brand an iPhone writes", () => {
    for (const brand of ["heic", "heix", "hevc", "mif1", "msf1"]) {
      const buf = ftyp(brand);
      // Not decodable, so it must not pass as a supported type...
      expect(sniffType(buf)).toBeNull();
      // ...but it must be recognisable enough to explain.
      expect(sniffUnsupported(buf)).toBe("image/heic");
    }
    // Real-world header shape: major brand plus a compatible-brand list.
    expect(sniffUnsupported(ftyp("heic", ["mif1", "miaf", "MiHB"]))).toBe("image/heic");
  });

  it("says nothing about files that are not ISO base media containers", () => {
    expect(sniffUnsupported(Buffer.from("%PDF-1.7\n"))).toBeNull();
    expect(sniffUnsupported(Buffer.from("hello"))).toBeNull();
    expect(sniffUnsupported(Buffer.alloc(4))).toBeNull();
  });

  it("does not claim an unrelated MP4 is an iPhone photo", () => {
    expect(sniffUnsupported(ftyp("isom", ["mp41"]))).toBeNull();
  });

  it("survives a truncated or hostile ftyp box", () => {
    const truncated = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from("ftypheic", "latin1")]);
    expect(() => sniffUnsupported(truncated)).not.toThrow();
    const huge = Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0xff]), Buffer.from("ftypheic", "latin1"), Buffer.alloc(32, 0)]);
    expect(sniffUnsupported(huge)).toBe("image/heic");
  });
});

describe("ingestFile", () => {
  it("processes a WebP upload end to end", async () => {
    const big = await sharp({ create: { width: 3200, height: 2400, channels: 3, background: "#eeeeee" } })
      .webp()
      .toBuffer();
    const r = await ingestFile("page-01.webp", big);
    expect(r.type).toBe("image/webp");
    // Converted to the oriented JPEG the model is given, long edge capped.
    expect(r.processed).toBeDefined();
    expect(r.width).toBe(2400);
    expect(r.height).toBe(1800);
  });

  it("tells an iPhone student exactly what to change", async () => {
    await expect(ingestFile("IMG_0042.HEIC", ftyp("heic", ["mif1"]))).rejects.toMatchObject({
      code: "HEIC_UNSUPPORTED",
      status: 415,
    });
    // The message has to carry the fix, not just the diagnosis.
    await expect(ingestFile("IMG_0042.HEIC", ftyp("heic"))).rejects.toThrow(/Most Compatible/);
    await expect(ingestFile("IMG_0042.HEIC", ftyp("heic"))).rejects.toThrow(/camera button/);
  });

  it("keeps the generic rejection for files that really are unsupported", async () => {
    await expect(ingestFile("notes.txt", Buffer.from("hello"))).rejects.toMatchObject({ code: "UNSUPPORTED_TYPE" });
  });
});
