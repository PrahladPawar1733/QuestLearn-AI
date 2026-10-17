/**
 * Client-side capture pipeline: camera -> quality check -> crop -> normalize.
 *
 * Framework-agnostic on purpose. The React camera UI imports from here only;
 * nothing in this folder touches React, and nothing imports the server-only
 * config, so the whole folder is safe in a client bundle or a Worker.
 */
export { CAPTURE_LIMITS, MIN_IMAGE_EDGE, SERVER_ACCEPTED_IMAGE_TYPES } from "./limits";

export {
  ORIENTATION_TRANSFORMS,
  isOrientation,
  orientationTransform,
  orientedSize,
  readOrientation,
  readOrientationFromBlob,
  type Orientation,
  type OrientationTransform,
  type TransformMatrix,
} from "./exif";

export {
  createSurface,
  hasCanvasSupport,
  resetWebpProbe,
  supportsWebpEncode,
  surfaceToBlob,
  type Ctx2D,
  type Surface,
} from "./canvas";

export {
  compressToBudget,
  drawOriented,
  fitWithin,
  halvingPlan,
  loadImageBitmap,
  normalizeImage,
  preferredMime,
  searchByteBudget,
  type BudgetOptions,
  type BudgetProbe,
  type BudgetResult,
  type EncodedImage,
  type NormalizeOptions,
  type Raster,
} from "./image";

export {
  ANALYSIS_EDGE,
  MIN_SEPARABILITY,
  QUALITY_THRESHOLDS,
  assessImageQuality,
  assessPixels,
  estimateDocumentCoverage,
  laplacianVariance,
  otsuThreshold,
  toGraySample,
  type CoverageEstimate,
  type GraySample,
  type ImageQuality,
  type QualityVerdict,
} from "./quality";

export {
  autoDocumentRect,
  clampRect,
  cropAndRotate,
  documentRectFromPixels,
  normalizeDeg,
  rectFromAspect,
  rotatedBounds,
  splitRotation,
  type CropOptions,
  type QuarterTurn,
  type Rect,
  type Size,
} from "./crop";

export {
  CAMERA_ERROR_MESSAGES,
  CameraError,
  CameraSession,
  classifyCameraError,
  hasCameraSupport,
  type CameraErrorKind,
  type CameraInfo,
  type CameraSupport,
  type FacingMode,
  type StartOptions,
} from "./camera";
