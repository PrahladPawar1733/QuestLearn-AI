import { describe, expect, it } from "vitest";
import { centersOf, clampIndex, dropIndexFor, moveAnnouncement, movePage, movePageBy, removeAt, replaceAt } from "../page-order";

const PAGES = ["a", "b", "c", "d"] as const;

describe("movePage", () => {
  it("shifts the rest rather than swapping", () => {
    // A drag means "insert here", so b..d slide down, not a..b trade places.
    expect(movePage(PAGES, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(movePage(PAGES, 3, 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("returns the same array when nothing would change", () => {
    // Lets the caller skip a re-render on every pointermove that lands in place.
    expect(movePage(PAGES, 1, 1)).toBe(PAGES);
    expect(movePage(["only"], 0, 3)).toEqual(["only"]);
  });

  it("clamps out-of-range indices instead of dropping the item", () => {
    expect(movePage(PAGES, 0, 99)).toEqual(["b", "c", "d", "a"]);
    expect(movePage(PAGES, -5, 2)).toEqual(["b", "c", "a", "d"]);
    expect(movePage(PAGES, 0, 99)).toHaveLength(PAGES.length);
  });
});

describe("movePageBy", () => {
  it("steps one place in either direction", () => {
    expect(movePageBy(PAGES, 1, -1)).toEqual(["b", "a", "c", "d"]);
    expect(movePageBy(PAGES, 1, 1)).toEqual(["a", "c", "b", "d"]);
  });

  it("does nothing at the ends, and never wraps around", () => {
    expect(movePageBy(PAGES, 0, -1)).toBe(PAGES);
    expect(movePageBy(PAGES, 3, 1)).toBe(PAGES);
  });
});

describe("removeAt / replaceAt", () => {
  it("keeps the order of everything else", () => {
    expect(removeAt(PAGES, 1)).toEqual(["a", "c", "d"]);
    expect(replaceAt(PAGES, 2, "C")).toEqual(["a", "b", "C", "d"]);
  });

  it("ignores indices that are not in the list", () => {
    expect(removeAt(PAGES, 9)).toBe(PAGES);
    expect(replaceAt(PAGES, -1, "x")).toBe(PAGES);
  });
});

describe("dropIndexFor", () => {
  // Four items, 20 px apart, centres at 10/30/50/70.
  const centers = [10, 30, 50, 70];

  it("counts the neighbours the pointer has passed", () => {
    expect(dropIndexFor(centers, 5, 0)).toBe(0);
    expect(dropIndexFor(centers, 35, 0)).toBe(1);
    expect(dropIndexFor(centers, 55, 0)).toBe(2);
    expect(dropIndexFor(centers, 99, 0)).toBe(3);
  });

  it("excludes the dragged item, so a slot cannot fight itself", () => {
    // Dragging item 3 upward: its own centre at 70 must not be counted, or the
    // index would stick at 3 and the row would jitter between two slots.
    expect(dropIndexFor(centers, 25, 3)).toBe(1);
    expect(dropIndexFor(centers, 5, 3)).toBe(0);
    // Holding still over its own slot resolves back to where it already is.
    expect(dropIndexFor(centers, 70, 3)).toBe(3);
    expect(dropIndexFor(centers, 30, 1)).toBe(1);
  });

  it("never returns an index outside the list", () => {
    expect(dropIndexFor([], 100, 0)).toBe(0);
    expect(dropIndexFor(centers, -1000, 2)).toBe(0);
    expect(dropIndexFor(centers, 1000, 2)).toBe(3);
  });
});

describe("centersOf", () => {
  it("measures along the requested axis only", () => {
    const rects = [
      { top: 0, left: 0, width: 100, height: 40 },
      { top: 40, left: 0, width: 100, height: 40 },
    ];
    expect(centersOf(rects, "y")).toEqual([20, 60]);
    expect(centersOf(rects, "x")).toEqual([50, 50]);
  });
});

describe("moveAnnouncement", () => {
  it("speaks a 1-based position", () => {
    expect(moveAnnouncement("Page 1", 2, 4)).toBe("Page 1 is now page 3 of 4.");
  });
});

describe("clampIndex", () => {
  it("survives junk input", () => {
    expect(clampIndex(Number.NaN, 5)).toBe(0);
    expect(clampIndex(2.7, 5)).toBe(2);
    expect(clampIndex(5, 0)).toBe(0);
  });
});
