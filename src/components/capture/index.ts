/**
 * Camera capture UI: the student-facing half of `src/lib/capture`.
 *
 * `src/lib/capture` is framework-free (camera session, EXIF, crop maths,
 * quality metrics); everything here is React and policy — when to warn, what to
 * say, and which gesture does what.
 */
export { CameraSheet, type CameraSheetProps } from "./camera-sheet";
export { CropEditor, type CropEditorProps } from "./crop-editor";
export { PageStrip, type PageStripProps } from "./page-strip";

export {
  CORNER_HANDLES,
  EDGE_HANDLES,
  HANDLE_LABELS,
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
  type CropHandle,
  type KeyCommand,
} from "./crop-geometry";

export { centersOf, clampIndex, dropIndexFor, moveAnnouncement, movePage, movePageBy, removeAt, replaceAt } from "./page-order";

export {
  countNeedingAttention,
  gateFor,
  hasGlare,
  isFarAway,
  qualitySummary,
  severityRank,
  worstGate,
  type GateSeverity,
  type GateTone,
  type QualityGate,
} from "./quality-gate";

export { assessBlob, isLikelyHeic, pageFileName, pageId, preparePage, prepareFileOrKeep, type PrepareOptions } from "./prepare";

export { revokePage, revokePages, type CapturedPage, type PageSource } from "./types";

export { usePointerReorder, type PointerReorder, type PointerReorderOptions } from "./use-pointer-reorder";
