/**
 * Minimal JPEG EXIF orientation reader.
 *
 * Phone cameras store the sensor read-out un-rotated and record the physical
 * orientation in EXIF. Canvas drawing ignores that tag, so every pipeline that
 * re-encodes a photo must apply the rotation itself or the uploaded page comes
 * out sideways. Only tag 0x0112 of IFD0 is needed, so there is no dependency.
 */

/** The eight legal EXIF orientation values; anything else is treated as 1. */
export type Orientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Canvas `setTransform` arguments, in the order the 2D context takes them. */
export type TransformMatrix = readonly [a: number, b: number, c: number, d: number, e: number, f: number];

export interface OrientationTransform {
  /** True when the corrected image is the source rotated a quarter turn, i.e. width/height swap. */
  readonly swapsAxes: boolean;
  /** Mirror horizontally *first*, then rotate clockwise by `rotateDeg`. */
  readonly flipH: boolean;
  readonly rotateDeg: 0 | 90 | 180 | 270;
  /**
   * Matrix mapping source pixel coords to corrected canvas coords, given the
   * *source* dimensions. Derived by hand: each case sends the source corners to
   * the corrected corners, e.g. orientation 6 (rotate 90° CW) maps (x,y) to
   * (h - y, x), hence [0, 1, -1, 0, h, 0].
   */
  readonly matrix: (width: number, height: number) => TransformMatrix;
}

/** Per-orientation canvas steps, so callers do not re-derive the matrices. */
export const ORIENTATION_TRANSFORMS: Readonly<Record<Orientation, OrientationTransform>> = {
  1: { swapsAxes: false, flipH: false, rotateDeg: 0, matrix: () => [1, 0, 0, 1, 0, 0] },
  2: { swapsAxes: false, flipH: true, rotateDeg: 0, matrix: (w) => [-1, 0, 0, 1, w, 0] },
  3: { swapsAxes: false, flipH: false, rotateDeg: 180, matrix: (w, h) => [-1, 0, 0, -1, w, h] },
  4: { swapsAxes: false, flipH: true, rotateDeg: 180, matrix: (_w, h) => [1, 0, 0, -1, 0, h] },
  5: { swapsAxes: true, flipH: true, rotateDeg: 270, matrix: () => [0, 1, 1, 0, 0, 0] },
  6: { swapsAxes: true, flipH: false, rotateDeg: 90, matrix: (_w, h) => [0, 1, -1, 0, h, 0] },
  7: { swapsAxes: true, flipH: true, rotateDeg: 90, matrix: (w, h) => [0, -1, -1, 0, h, w] },
  8: { swapsAxes: true, flipH: false, rotateDeg: 270, matrix: (w) => [0, -1, 1, 0, 0, w] },
};

/** Look up the canvas steps for an orientation, falling back to identity. */
export function orientationTransform(orientation: number): OrientationTransform {
  return ORIENTATION_TRANSFORMS[isOrientation(orientation) ? orientation : 1];
}

/** Narrow an arbitrary number to a legal EXIF orientation. */
export function isOrientation(value: number): value is Orientation {
  return Number.isInteger(value) && value >= 1 && value <= 8;
}

/** Output dimensions after orientation correction (quarter turns swap the axes). */
export function orientedSize(width: number, height: number, orientation: number): { width: number; height: number } {
  return orientationTransform(orientation).swapsAxes ? { width: height, height: width } : { width, height };
}

const EXIF_HEADER = 0x45786966; // "Exif"
const TAG_ORIENTATION = 0x0112;
const TYPE_SHORT = 3;

/**
 * Read the EXIF orientation of a JPEG. Returns 1 for PNG/WebP, a JPEG without
 * EXIF, or a truncated/garbage buffer — never throws, because a bad tag must
 * not block a student's upload.
 */
export function readOrientation(buf: ArrayBuffer): Orientation {
  try {
    return parseOrientation(new DataView(buf)) ?? 1;
  } catch {
    // Any out-of-range read means the metadata is damaged; the pixels may still be fine.
    return 1;
  }
}

function parseOrientation(view: DataView): Orientation | null {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null; // not a JPEG SOI

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    // Markers may be preceded by any number of 0xFF fill bytes.
    if (view.getUint8(offset) !== 0xff) return null;
    let marker = view.getUint8(offset + 1);
    while (marker === 0xff && offset + 2 < view.byteLength) {
      offset += 1;
      marker = view.getUint8(offset + 1);
    }
    // SOS/EOI: image data begins, no more metadata segments.
    if (marker === 0xda || marker === 0xd9) return null;
    // Standalone markers (TEM, RSTn) carry no length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const size = view.getUint16(offset + 2);
    if (size < 2) return null;
    const segment = offset + 4;
    const segmentEnd = segment + size - 2;
    if (segmentEnd > view.byteLength) return null;

    if (marker === 0xe1 && segmentEnd - segment >= 8 && view.getUint32(segment) === EXIF_HEADER) {
      return readIfd0Orientation(view, segment + 6, segmentEnd); // skip "Exif\0\0"
    }
    offset = segmentEnd;
  }
  return null;
}

function readIfd0Orientation(view: DataView, tiff: number, end: number): Orientation | null {
  if (tiff + 8 > end) return null;
  const byteOrder = view.getUint16(tiff);
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return null;
  const little = byteOrder === 0x4949;
  if (view.getUint16(tiff + 2, little) !== 0x002a) return null;

  const ifd0 = tiff + view.getUint32(tiff + 4, little);
  if (ifd0 + 2 > end) return null;
  const count = view.getUint16(ifd0, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd0 + 2 + i * 12;
    if (entry + 12 > end) return null;
    if (view.getUint16(entry, little) !== TAG_ORIENTATION) continue;
    // Orientation is a single SHORT, so it is inline in the value field.
    if (view.getUint16(entry + 2, little) !== TYPE_SHORT) return null;
    const value = view.getUint16(entry + 8, little);
    return isOrientation(value) ? value : null;
  }
  return null;
}

/** Read the orientation straight off a Blob — only the first 128 KB can hold APP1. */
export async function readOrientationFromBlob(blob: Blob): Promise<Orientation> {
  const head = blob.slice(0, Math.min(blob.size, 128 * 1024));
  return readOrientation(await head.arrayBuffer());
}
