/**
 * Runtime configuration. Everything is server-only; nothing here is ever
 * sent to the browser except the coarse `publicStatus()` summary.
 */
import "server-only";

export type AiMode = "vertex" | "gemini-api" | "demo";

function bool(v: string | undefined): boolean {
  return v === "1" || v?.toLowerCase() === "true";
}

export const config = {
  get aiMode(): AiMode {
    if (bool(process.env.QL_FORCE_DEMO)) return "demo";
    if (bool(process.env.GOOGLE_GENAI_USE_VERTEXAI) || process.env.QL_AI_PROVIDER === "vertex") {
      return process.env.GOOGLE_CLOUD_PROJECT ? "vertex" : "demo";
    }
    if (process.env.GEMINI_API_KEY) return "gemini-api";
    if (process.env.GOOGLE_CLOUD_PROJECT && process.env.QL_AI_PROVIDER !== "none") return "vertex";
    return "demo";
  },
  get project() {
    return process.env.GOOGLE_CLOUD_PROJECT ?? "";
  },
  get location() {
    return process.env.GOOGLE_CLOUD_LOCATION ?? "global";
  },
  get model() {
    // Gemini 2.5 models retire on 2026-10-20 on Vertex AI; 3.5 Flash is stable until at least 2027-05.
    return process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
  },
  get reviewModel() {
    return process.env.GEMINI_REVIEW_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
  },
  get veoModel() {
    return process.env.VEO_MODEL ?? "";
  },
  get videoEnabled() {
    return bool(process.env.QL_ENABLE_VIDEO) && !!process.env.VEO_MODEL && this.aiMode === "vertex" && !!this.bucket;
  },
  get dbMode(): "firestore" | "local" {
    return process.env.QL_DB === "firestore" ? "firestore" : "local";
  },
  get firestoreDatabase() {
    return process.env.FIRESTORE_DATABASE ?? "(default)";
  },
  get storageMode(): "gcs" | "local" {
    return process.env.GCS_BUCKET ? "gcs" : "local";
  },
  get bucket() {
    return process.env.GCS_BUCKET ?? "";
  },
  get dataDir() {
    return process.env.QL_DATA_DIR ?? ".data";
  },
  get aiTimeoutMs() {
    return Number(process.env.QL_AI_TIMEOUT_MS ?? 90_000);
  },
  limits: {
    maxFileBytes: 10 * 1024 * 1024,
    maxTotalBytes: 40 * 1024 * 1024,
    maxFiles: 20,
    maxPdfPages: 40,
    maxImageEdge: 2400,
  },
};

export function publicStatus() {
  return {
    aiMode: config.aiMode,
    aiAvailable: config.aiMode !== "demo",
    model: config.aiMode === "demo" ? null : config.model,
    db: config.dbMode,
    storage: config.storageMode,
    videoEnabled: config.videoEnabled,
  };
}
