"use client";

/**
 * Public surface of the procedural audio engine.
 *
 * A game holds exactly one `GameAudio` (see `gameAudio`), calls `unlock()` from
 * the first user gesture, drives `engine.update()` from its loop, and fires
 * `sfx.*` from events. Everything degrades to a silent no-op on the server,
 * without Web Audio, or when the player has turned sound off.
 */
import {
  BUS_NAMES,
  dispose as disposeContext,
  getBus,
  getRuntime,
  isAudioReady,
  isEnabled,
  mute,
  setBusVolume,
  setEnabled,
  resume,
  setMasterVolume,
  setMuted,
  snapshot,
  state,
  subscribe,
  suspend,
  unlock,
  unmute,
  type AudioPrefs,
  type AudioRuntime,
  type AudioSnapshot,
  type BusName,
} from "./context";
import { DEFAULT_ENGINE, EngineSound, engineCutoff, engineGain, firingFrequency, rpmNorm, type EngineConfig, type EngineParams } from "./engine-sound";
import { GenerativeMusic, music, stepTime, stepsDueBefore } from "./music";
import { getNoiseBuffer, createNoiseSource, generateNoise, type NoiseKind } from "./noise";
import * as sfx from "./sfx";

export {
  BUS_NAMES,
  DEFAULT_ENGINE,
  EngineSound,
  GenerativeMusic,
  createNoiseSource,
  disposeContext,
  engineCutoff,
  engineGain,
  firingFrequency,
  generateNoise,
  getBus,
  getNoiseBuffer,
  getRuntime,
  isAudioReady,
  isEnabled,
  mute,
  music,
  resume,
  rpmNorm,
  setBusVolume,
  setEnabled,
  setMasterVolume,
  setMuted,
  sfx,
  snapshot,
  state,
  stepTime,
  stepsDueBefore,
  subscribe,
  suspend,
  unlock,
  unmute,
};
export type { AudioPrefs, AudioRuntime, AudioSnapshot, BusName, EngineConfig, EngineParams, NoiseKind };

/**
 * One handle a game can keep. The engine voice is built lazily on the first
 * `startEngine()`, because a game that never shows a car should never pay for
 * six oscillators.
 */
export class GameAudio {
  readonly sfx = sfx;
  readonly music: GenerativeMusic = music;
  private engineVoice: EngineSound | null = null;
  private engineConfig: Partial<EngineConfig> = {};

  /** Call from a real user gesture. Resolves false if audio is unavailable. */
  unlock(): Promise<boolean> {
    return unlock();
  }

  get ready(): boolean {
    return isAudioReady();
  }

  get state(): AudioContextState | null {
    return state();
  }

  snapshot(): AudioSnapshot {
    return snapshot();
  }

  subscribe(fn: (s: AudioSnapshot) => void): () => void {
    return subscribe(fn);
  }

  configureEngine(config: Partial<EngineConfig>): void {
    this.engineConfig = config;
    if (this.engineVoice) {
      this.engineVoice.dispose();
      this.engineVoice = null;
    }
  }

  get engine(): EngineSound | null {
    return this.engineVoice;
  }

  startEngine(): void {
    if (!this.engineVoice) {
      if (!isAudioReady()) return;
      this.engineVoice = new EngineSound(this.engineConfig);
    }
    this.engineVoice.start();
  }

  stopEngine(): void {
    this.engineVoice?.stop();
  }

  /** Per-frame. No-op (and no allocation) when the engine is not running. */
  updateEngine(params: EngineParams): void {
    this.engineVoice?.update(params);
  }

  startMusic(): void {
    this.music.start();
  }

  stopMusic(): void {
    this.music.stop();
  }

  setMusicIntensity(v: number): void {
    this.music.setIntensity(v);
  }

  setMasterVolume(v: number): void {
    setMasterVolume(v);
  }

  setBusVolume(bus: BusName, v: number): void {
    setBusVolume(bus, v);
  }

  mute(): void {
    mute();
  }

  unmute(): void {
    unmute();
  }

  /** The settings kill switch; also silences anything already playing. */
  setEnabled(enabled: boolean): void {
    setEnabled(enabled);
    this.engineVoice?.setEnabled(enabled);
    if (!enabled) {
      this.music.stop(0.15);
      sfx.stopTyreSkid();
      sfx.stopWind();
    }
  }

  suspend(): Promise<void> {
    return suspend();
  }

  resume(): Promise<boolean> {
    return unlock();
  }

  /** Full teardown: leaving the game route. */
  dispose(): void {
    this.engineVoice?.dispose();
    this.engineVoice = null;
    this.music.dispose();
    sfx.disposeSfx();
    disposeContext();
  }
}

/** The shared instance most callers want. */
export const gameAudio = new GameAudio();
