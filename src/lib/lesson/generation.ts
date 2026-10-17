/**
 * The seam where server-generated narration attaches to a scene.
 *
 * **Nothing here calls a model.** It cannot: generation is a server concern
 * (`docs/audio-and-video-lessons.md:688-696` — `src/lib/ai/speech.ts`,
 * `src/lib/services/narration.ts`, `GET /api/quests/[id]/narration`), all of
 * which the lead owns. This file defines the contract those pieces fulfil,
 * plus the pure function that merges a manifest into a scene, so the client
 * is complete and testable before any of it exists.
 *
 * The important property: `attachNarration` only ever *adds* `audio` to cues.
 * A scene is a complete lesson before it runs and a complete lesson after it,
 * which is what makes "captions are the primary channel, audio is an
 * enhancement" structurally true rather than a promise.
 */
import type { CueAudio, NarratedScene, SceneCue } from "./types";

/** One generated clip, as the manifest route reports it. */
export interface NarrationClip {
  /** Which cue this clip belongs to. */
  cueId: string;
  /** `narration__{questId}__{slot}` — see `docs/audio-and-video-lessons.md:147`. */
  assetId: string;
  /** Playback URL, present only when `status === "ready"`. */
  url?: string;
  durationMs?: number;
  status: CueAudio["status"];
}

export interface NarrationManifest {
  sceneId: string;
  questId?: string;
  /** Voice and model are carried so a mismatch is debuggable from the client. */
  voice?: string;
  model?: string;
  /**
   * `unavailable` is the common case on the free key: the daily TTS budget is
   * 20 requests for the whole key, which is three narrated quests per day
   * (`docs/audio-and-video-lessons.md:755`). It is deliberately
   * indistinguishable from success to the student — captions, no controls.
   */
  status: "ready" | "partial" | "unavailable";
  clips: NarrationClip[];
}

/**
 * What the lead wires up. One method, so the stub and the real thing are
 * interchangeable and the player never knows which it got.
 *
 * The real implementation is `GET /api/quests/{questId}/narration` via
 * `src/lib/api-client.ts`. It must never throw for a missing manifest —
 * resolve `null` and the scene stays caption-only.
 */
export interface NarrationSource {
  fetchManifest(sceneId: string, questId?: string): Promise<NarrationManifest | null>;
}

/**
 * The stub that ships today. Always resolves a manifest with no clips, which
 * is exactly the `QL_ENABLE_TTS` unset path, so the demo scene renders its
 * real, intended production state rather than a mock.
 */
export function createStubNarrationSource(): NarrationSource {
  return {
    async fetchManifest(sceneId) {
      return { sceneId, status: "unavailable", clips: [] };
    },
  };
}

/** The manifest shape for "we chose not to spend quota". */
export function unavailableManifest(scene: NarratedScene): NarrationManifest {
  return { sceneId: scene.id, questId: scene.questId, status: "unavailable", clips: [] };
}

/**
 * Merge a manifest into a scene, returning a new scene. Pure; the input is
 * never mutated.
 *
 * Clips whose `status` is not `"ready"` are still attached, because the cue's
 * status is useful to the UI ("narration is still being prepared"), and
 * `hasPlayableAudio()` already refuses to play anything but `ready`.
 */
export function attachNarration(scene: NarratedScene, manifest: NarrationManifest | null): NarratedScene {
  if (!manifest || manifest.clips.length === 0) return scene;
  const byCue = new Map(manifest.clips.map((c) => [c.cueId, c]));
  let changed = false;
  const cues: SceneCue[] = scene.cues.map((cue) => {
    if (cue.kind !== "narration") return cue;
    const clip = byCue.get(cue.id);
    if (!clip) return cue;
    changed = true;
    return {
      ...cue,
      audio: {
        assetId: clip.assetId,
        url: clip.url,
        durationMs: clip.durationMs,
        status: clip.status,
      },
    };
  });
  return changed ? { ...scene, cues } : scene;
}

/** Strip every clip back off a scene — "narration off" without a refetch. */
export function detachNarration(scene: NarratedScene): NarratedScene {
  let changed = false;
  const cues: SceneCue[] = scene.cues.map((cue) => {
    if (cue.kind !== "narration" || !cue.audio) return cue;
    changed = true;
    return { ...cue, audio: undefined };
  });
  return changed ? { ...scene, cues } : scene;
}

/**
 * Resolve a cue id to its clip URL, for `createWebAudioSceneAudio`.
 * Returns null for every cue that has no playable clip, which is the signal
 * the sink uses to leave that cue silent.
 */
export function clipUrlResolver(scene: NarratedScene): (cueId: string) => string | null {
  const urls = new Map<string, string>();
  for (const cue of scene.cues) {
    if (cue.kind === "narration" && cue.audio?.status === "ready" && cue.audio.url) {
      urls.set(cue.id, cue.audio.url);
    }
  }
  return (cueId) => urls.get(cueId) ?? null;
}

/** True when at least one cue has a clip worth fetching. */
export function sceneHasNarration(scene: NarratedScene): boolean {
  return scene.cues.some((cue) => cue.kind === "narration" && cue.audio?.status === "ready");
}
