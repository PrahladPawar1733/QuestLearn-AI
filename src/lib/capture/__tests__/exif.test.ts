import { describe, expect, it } from "vitest";
import {
  ORIENTATION_TRANSFORMS,
  isOrientation,
  orientationTransform,
  orientedSize,
  readOrientation,
  type Orientation,
} from "../exif";

/** Build the smallest JPEG that carries an APP1/EXIF IFD0 orientation tag. */
function jpegWithOrientation(orientation: number, opts: { little?: boolean; extraSegment?: boolean } = {}): ArrayBuffer {
  const little = opts.little ?? true;
  const tiff: number[] = [];
  const u16 = (v: number) => (little ? [v & 0xff, (v >> 8) & 0xff] : [(v >> 8) & 0xff, v & 0xff]);
  const u32 = (v: number) =>
    little
      ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]
      : [(v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];

  tiff.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]));
  tiff.push(...u16(0x002a));
  tiff.push(...u32(8)); // IFD0 starts right after the 8-byte TIFF header
  tiff.push(...u16(2)); // two entries, so the walk has to skip one
  // Entry 1: ImageWidth (0x0100), LONG — must be skipped.
  tiff.push(...u16(0x0100), ...u16(4), ...u32(1), ...u32(640));
  // Entry 2: Orientation (0x0112), SHORT, value inline in the 4-byte field.
  tiff.push(...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0);
  tiff.push(...u32(0)); // no IFD1

  const app1 = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff]; // "Exif\0\0" + TIFF
  const bytes: number[] = [0xff, 0xd8];
  if (opts.extraSegment) {
    // A JFIF APP0 ahead of APP1, which is what real cameras emit.
    const app0 = [0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02, 0, 0, 0, 1, 0, 1, 0, 0];
    bytes.push(0xff, 0xe0, ((app0.length + 2) >> 8) & 0xff, (app0.length + 2) & 0xff, ...app0);
  }
  bytes.push(0xff, 0xe1, ((app1.length + 2) >> 8) & 0xff, (app1.length + 2) & 0xff, ...app1);
  bytes.push(0xff, 0xd9);
  return new Uint8Array(bytes).buffer;
}

describe("EXIF orientation", () => {
  it("reads every legal orientation, little- and big-endian", () => {
    for (let o = 1; o <= 8; o++) {
      expect(readOrientation(jpegWithOrientation(o))).toBe(o);
      expect(readOrientation(jpegWithOrientation(o, { little: false }))).toBe(o);
    }
  });

  it("walks past other segments to find APP1", () => {
    expect(readOrientation(jpegWithOrientation(6, { extraSegment: true }))).toBe(6);
  });

  it("falls back to 1 when the tag is absent, out of range or damaged", () => {
    expect(readOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer)).toBe(1); // no APP1
    expect(readOrientation(jpegWithOrientation(9))).toBe(1); // illegal value
    expect(readOrientation(jpegWithOrientation(0))).toBe(1);
    expect(readOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBe(1); // PNG
    expect(readOrientation(new Uint8Array(0).buffer)).toBe(1);
    expect(readOrientation(new Uint8Array([0xff, 0xd8]).buffer)).toBe(1);
    expect(readOrientation(new Uint8Array(64).fill(0x5a).buffer)).toBe(1); // garbage
  });

  it("survives a truncated APP1 segment", () => {
    const full = new Uint8Array(jpegWithOrientation(8));
    for (const cut of [10, 14, 20, 24, 30]) {
      expect(readOrientation(full.slice(0, cut).buffer)).toBe(1);
    }
  });

  it("claims a length longer than the buffer without throwing", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0x45, 0x78, 0x69, 0x66]);
    expect(readOrientation(bytes.buffer)).toBe(1);
  });

  it("swaps the axes exactly for the quarter-turn orientations", () => {
    for (const o of [1, 2, 3, 4] as Orientation[]) {
      expect(orientedSize(400, 300, o)).toEqual({ width: 400, height: 300 });
    }
    for (const o of [5, 6, 7, 8] as Orientation[]) {
      expect(orientedSize(400, 300, o)).toEqual({ width: 300, height: 400 });
    }
    expect(orientationTransform(99)).toBe(ORIENTATION_TRANSFORMS[1]);
    expect(isOrientation(4.5)).toBe(false);
  });

  it("maps the source corners onto the corrected frame for every orientation", () => {
    const W = 400;
    const H = 300;
    for (let o = 1; o <= 8; o++) {
      const t = orientationTransform(o);
      const [a, b, c, d, e, f] = t.matrix(W, H);
      const out = orientedSize(W, H, o);
      const corners = [
        [0, 0],
        [W, 0],
        [0, H],
        [W, H],
      ].map(([x, y]) => `${a * x + c * y + e},${b * x + d * y + f}`);
      expect(new Set(corners)).toEqual(
        new Set([`0,0`, `${out.width},0`, `0,${out.height}`, `${out.width},${out.height}`]),
      );
    }
  });

  it("pins orientation 6 to a clockwise quarter turn", () => {
    const t = orientationTransform(6);
    expect(t).toMatchObject({ swapsAxes: true, flipH: false, rotateDeg: 90 });
    // Top-left of a 400x300 source must land top-right of the 300x400 result.
    const [a, b, c, d, e, f] = t.matrix(400, 300);
    expect([a * 0 + c * 0 + e, b * 0 + d * 0 + f]).toEqual([300, 0]);
  });
});
