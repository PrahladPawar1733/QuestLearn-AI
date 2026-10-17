import "server-only";
import type { GenerateVideosOperation } from "@google/genai";
import { genai } from "../ai/client";
import { audit } from "../audit";
import { config } from "../config";
import { db } from "../db";
import { AppError } from "../errors";
import { nowIso } from "../ids";
import type { LearningAsset } from "../types";
import { loadConcept } from "./access";

/**
 * Optional short teaching video via Veo on Vertex AI. Only runs when
 * QL_ENABLE_VIDEO=true, VEO_MODEL is set, AI is in Vertex mode and a GCS
 * bucket is configured. The quest never waits on this: the diagram and
 * worked example are always shown first.
 */
export async function requestConceptVideo(uid: string, conceptId: string) {
  if (!config.videoEnabled) {
    throw new AppError(
      "VIDEO_UNAVAILABLE",
      "Video lessons aren't enabled on this server. The animated diagram and worked example cover this concept instead.",
      501,
    );
  }
  const concept = await loadConcept(conceptId, uid);
  const id = `video__${uid}__${conceptId}`;
  const existing = await db().get<LearningAsset>("assets", id);
  if (existing && ["processing", "ready"].includes(existing.generationStatus)) return refreshVideo(existing);

  const prompt = `A clean, 8-second educational physics animation for high-school students explaining "${concept.title}": ${concept.description}. Simple flat 2D style on a dark navy background, two coloured balls on a straight track, velocity arrows, no text, no people.`;
  const op = await genai().models.generateVideos({
    model: config.veoModel,
    source: { prompt },
    config: { numberOfVideos: 1, outputGcsUri: `gs://${config.bucket}/users/${uid}/videos/${conceptId}/` },
  });
  const asset: LearningAsset = {
    id,
    ownerId: uid,
    conceptId,
    type: "video",
    origin: "ai_generated",
    generationStatus: "processing",
    operationName: op.name,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await db().set("assets", asset);
  await audit({ operation: "video.generate", model: config.veoModel, ownerId: uid, inputRefs: [conceptId], outcome: "success", durationMs: 0, action: "video job started" });
  return asset;
}

export async function refreshVideo(asset: LearningAsset) {
  if (asset.generationStatus !== "processing" || !asset.operationName) return asset;
  try {
    const op = await genai().operations.getVideosOperation({ operation: { name: asset.operationName } as GenerateVideosOperation });
    if (op.done) {
      const uri = op.response?.generatedVideos?.[0]?.video?.uri;
      asset.generationStatus = uri ? "ready" : "failed";
      asset.storagePath = uri;
      asset.error = uri ? undefined : op.error ? "Video generation failed." : "No video was returned.";
      asset.updatedAt = nowIso();
      await db().set("assets", asset);
    }
  } catch (e) {
    asset.generationStatus = "failed";
    asset.error = "Couldn't check the video job. You can retry.";
    asset.updatedAt = nowIso();
    await db().set("assets", asset);
    console.error("[video] poll failed", (e as Error).message);
  }
  return asset;
}
