import { describe, expect, it } from "vitest";
import {
  MIN_CROP_PX,
  applyHandleDrag,
  describeRect,
  fitScale,
  handleKeyDelta,
  keyCommand,
  minFor,
  moveRectBy,
  nudgeStep,
  quarterTurn,
  rectPercent,
  rotatePointerDelta,
} from "../crop-geometry";

const BOUNDS = { width: 2000, height: 1500 };
const RECT = { x: 400, y: 300, width: 1000, height: 800 };

describe("applyHandleDrag", () => {
  it("moves the dragged edge only", () => {
    expect(applyHandleDrag(RECT, "se", 100, 50, BOUNDS)).toEqual({ x: 400, y: 300, width: 1100, height: 850 });
    expect(applyHandleDrag(RECT, "nw", 100, 50, BOUNDS)).toEqual({ x: 500, y: 350, width: 900, height: 750 });
    expect(applyHandleDrag(RECT, "e", 100, 999, BOUNDS)).toEqual({ x: 400, y: 300, width: 1100, height: 800 });
    expect(applyHandleDrag(RECT, "n", 999, -100, BOUNDS)).toEqual({ x: 400, y: 200, width: 1000, height: 900 });
  });

  it("stops at the image edge instead of growing past it", () => {
    expect(applyHandleDrag(RECT, "se", 5000, 5000, BOUNDS)).toEqual({ x: 400, y: 300, width: 1600, height: 1200 });
    expect(applyHandleDrag(RECT, "nw", -5000, -5000, BOUNDS)).toEqual({ x: 0, y: 0, width: 1400, height: 1100 });
  });

  it("never inverts the rect, however fast the drag", () => {
    // Dragging the bottom-right corner far past the top-left: the rect should
    // collapse to the minimum, not flip inside out with a negative size.
    const collapsed = applyHandleDrag(RECT, "se", -5000, -5000, BOUNDS);
    expect(collapsed).toEqual({ x: 400, y: 300, width: MIN_CROP_PX, height: MIN_CROP_PX });
    const other = applyHandleDrag(RECT, "nw", 5000, 5000, BOUNDS);
    expect(other.width).toBe(MIN_CROP_PX);
    expect(other.height).toBe(MIN_CROP_PX);
    // The far edges stayed put, which is what "resize from this corner" means.
    expect(other.x + other.width).toBe(RECT.x + RECT.width);
    expect(other.y + other.height).toBe(RECT.y + RECT.height);
  });

  it("lets a small image crop below the nominal minimum", () => {
    // The 200 px floor cannot apply to a 120 px image, or the box would be
    // unresizable and the student would be stuck.
    const tiny = { width: 120, height: 90 };
    expect(minFor(tiny)).toEqual({ width: 120, height: 90 });
    const r = applyHandleDrag({ x: 0, y: 0, width: 120, height: 90 }, "se", -100, -100, tiny);
    expect(r).toEqual({ x: 0, y: 0, width: 120, height: 90 });
  });

  it("slides the whole rect for the interior handle, keeping its size", () => {
    expect(applyHandleDrag(RECT, "move", -200, 100, BOUNDS)).toEqual({ x: 200, y: 400, width: 1000, height: 800 });
    // Pushed off the edge: the position is pulled back, the size is preserved.
    const pushed = moveRectBy(RECT, 9999, 9999, BOUNDS);
    expect(pushed).toEqual({ x: 1000, y: 700, width: 1000, height: 800 });
  });
});

describe("rotatePointerDelta", () => {
  it("is the identity for an unrotated, unmirrored view", () => {
    expect(rotatePointerDelta(10, -4, 0, false)).toEqual({ dx: 10, dy: -4 });
  });

  it("undoes a quarter turn, so a corner follows the finger", () => {
    // The stage is rotated 90° clockwise, so the image's +y axis now points
    // screen-left: a rightward swipe is a *negative y* move in image space.
    // Without this inversion the handle would run off at right angles.
    const r = rotatePointerDelta(10, 0, 90, false);
    expect(r.dx).toBeCloseTo(0);
    expect(r.dy).toBeCloseTo(-10);
    const back = rotatePointerDelta(0, 10, 90, false);
    expect(back.dx).toBeCloseTo(10);
    expect(back.dy).toBeCloseTo(0);
  });

  it("mirrors x only when the view is flipped", () => {
    expect(rotatePointerDelta(10, 6, 0, true)).toEqual({ dx: -10, dy: 6 });
  });

  it("converts screen pixels to image pixels through the view scale", () => {
    // At 25% zoom, 10 screen px of drag is 40 image px.
    const r = rotatePointerDelta(10, 0, 0, false, 0.25);
    expect(r.dx).toBeCloseTo(40);
  });

  it("round-trips: inverse of the view transform, for every quarter turn", () => {
    for (const deg of [0, 90, 180, 270]) {
      const { dx, dy } = rotatePointerDelta(7, -3, deg, false);
      const rad = (deg * Math.PI) / 180;
      // Re-apply the forward transform; we should be back at the screen delta.
      const sx = Math.cos(rad) * dx - Math.sin(rad) * dy;
      const sy = Math.sin(rad) * dx + Math.cos(rad) * dy;
      expect(sx).toBeCloseTo(7);
      expect(sy).toBeCloseTo(-3);
    }
  });

  it("falls back to a scale of 1 rather than dividing by zero", () => {
    expect(rotatePointerDelta(10, 0, 0, false, 0)).toEqual({ dx: 10, dy: 0 });
  });
});

describe("keyboard mapping", () => {
  it("nudges with arrows and resizes with Shift", () => {
    const step = nudgeStep(BOUNDS);
    expect(keyCommand("ArrowRight", false, BOUNDS)).toEqual({ kind: "move", dx: step, dy: 0 });
    expect(keyCommand("ArrowUp", true, BOUNDS)).toEqual({ kind: "resize", dx: 0, dy: -step });
  });

  it("leaves keys it does not own alone", () => {
    expect(keyCommand("Enter", false, BOUNDS)).toBeNull();
    expect(keyCommand("Tab", true, BOUNDS)).toBeNull();
    expect(handleKeyDelta("Escape", false, BOUNDS)).toBeNull();
  });

  it("makes Shift a coarse jump on a grip", () => {
    const fine = handleKeyDelta("ArrowRight", false, BOUNDS);
    const coarse = handleKeyDelta("ArrowRight", true, BOUNDS);
    expect(coarse?.dx).toBe((fine?.dx ?? 0) * 5);
  });

  it("keeps a nudge visible on a tiny image", () => {
    expect(nudgeStep({ width: 60, height: 40 })).toBeGreaterThanOrEqual(1);
  });

  it("walks the box to the edge and no further", () => {
    let rect = { x: 0, y: 0, width: 400, height: 400 };
    const bounds = { width: 1000, height: 1000 };
    for (let i = 0; i < 500; i++) {
      const cmd = keyCommand("ArrowLeft", false, bounds);
      rect = applyHandleDrag(rect, "move", cmd?.dx ?? 0, cmd?.dy ?? 0, bounds);
    }
    expect(rect).toEqual({ x: 0, y: 0, width: 400, height: 400 });
  });
});

describe("view helpers", () => {
  it("fits content into the view without ever enlarging it", () => {
    expect(fitScale({ width: 2000, height: 1000 }, { width: 500, height: 500 })).toBe(0.25);
    expect(fitScale({ width: 100, height: 100 }, { width: 500, height: 500 })).toBe(1);
    expect(fitScale({ width: 0, height: 0 }, { width: 500, height: 500 })).toBe(1);
  });

  it("expresses the crop as percentages, so the overlay needs no measuring", () => {
    expect(rectPercent({ x: 500, y: 375, width: 1000, height: 750 }, BOUNDS)).toEqual({
      left: "25%",
      top: "25%",
      width: "50%",
      height: "50%",
    });
  });

  it("describes the crop in percentages a student can check", () => {
    expect(describeRect({ x: 0, y: 0, width: 1000, height: 750 }, BOUNDS)).toBe(
      "Keeping 50% of the width and 50% of the height, starting 0% across and 0% down.",
    );
  });

  it("folds any number of quarter turns, in both directions", () => {
    expect(quarterTurn(0)).toBe(0);
    expect(quarterTurn(1)).toBe(90);
    expect(quarterTurn(4)).toBe(0);
    expect(quarterTurn(-1)).toBe(270);
    expect(quarterTurn(-5)).toBe(270);
    expect(quarterTurn(7)).toBe(270);
  });
});
