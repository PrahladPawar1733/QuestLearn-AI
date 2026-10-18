"use client";

/**
 * Spider Climb — the page.
 *
 * Styled to the reference design: ink background, mint accent, a stage band
 * for the animation, and the question as real DOM beneath it. Everything a
 * student reads is HTML — proper typography, selectable text, real buttons
 * with focus rings and screen-reader support — which is the main reason this
 * layout beats painting a question into a canvas.
 *
 * Tokens are inlined from the reference rather than taken from the app's
 * palette on purpose: this is a game skin with its own identity, and it must
 * look the same whatever theme the rest of the app is in.
 */
import { RichText } from "@/components/math/rich-text";
import { cn } from "@/lib/cn";
import type { GameHudProps } from "@/lib/game/module";
import type { SpiderHud } from "./game";

const MINT = "#c3f18c";
const PAPER = "#eef1e9";
const MUTED = "#93a0b9";
const LINE = "#293245";

export function SpiderClimbHud({ hud, onChoose, onContinue }: GameHudProps<SpiderHud>) {
  const q = hud.question;

  return (
    <div
      className="relative min-h-[100dvh] w-full"
      // --stage-top tells the host exactly where to put the canvas band, so
      // the animation lines up with the frame drawn here.
      style={{ color: PAPER, fontFamily: "Arial, Helvetica, sans-serif", ["--stage-top" as string]: "var(--sc-stage-top)" }}
    >
      <div className="mx-auto w-full max-w-[1500px] px-[4%] sm:px-[5%]">
        {/* ---------------- HUD row ---------------- */}
        <div
          className="flex h-[var(--sc-head)] items-center justify-between gap-4"
          style={{ ["--sc-head" as string]: "86px" }}
        >
          <div className="min-w-0">
            <span className="block text-[10px] font-extrabold uppercase tracking-[2.3px]" style={{ color: MINT }}>
              {hud.intent || "Spider Climb"}
            </span>
            <h1 className="my-1.5 text-[15px] font-bold sm:text-[19px]">
              Building {Math.min(hud.total, hud.answered + 1)} of {hud.total}
            </h1>
          </div>
          <div className="flex gap-3 text-right sm:gap-6">
            <Stat label="Health" value={"●".repeat(hud.hearts) || "—"} tone={hud.hearts <= 1 ? "warn" : "normal"} />
            <Stat label="Score" value={hud.score.toLocaleString()} />
            <Stat label="Streak" value={String(hud.streak)} />
            <Stat label="First try" value={String(hud.firstTry)} />
          </div>
        </div>

        {/* ---------------- the stage band ----------------
            The canvas is painted behind this by the host; this element only
            reserves the space and draws the frame and the banner over it. */}
        <div
          data-game-stage
          className="relative overflow-hidden rounded-[18px]"
          style={{ height: "clamp(270px,43vh,470px)", border: `1px solid #37435a`, background: "transparent" }}
        >
          {hud.banner && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
              <div
                className="max-w-[680px] rounded-[10px] px-[18px] py-[13px] text-[13px] leading-[1.5] backdrop-blur-[10px]"
                style={{ border: `1px solid ${hud.banner.color}`, background: "#111e24ef" }}
              >
                <strong className="mr-2.5" style={{ color: hud.banner.color }}>
                  {hud.banner.title}
                </strong>
                <RichText text={hud.banner.text} />
              </div>
            </div>
          )}
        </div>

        {/* progress pips */}
        <div className="mt-2.5 flex gap-1">
          {Array.from({ length: hud.total }).map((_, i) => (
            <i
              key={i}
              className="h-1 w-[22px] rounded-[3px]"
              style={{ background: i < hud.answered ? MINT : "#313c50" }}
            />
          ))}
        </div>

        {/* ---------------- question panel ---------------- */}
        <div className="min-h-[220px] pb-16 pt-6">
          {hud.awaitingRetry && hud.reveal ? (
            <div className="pl-[22px]" style={{ borderLeft: `3px solid ${MINT}` }}>
              <span className="block text-[10px] font-extrabold uppercase tracking-[2.3px]" style={{ color: MINT }}>
                This is the anchor that holds
              </span>
              {hud.reveal.correctText && (
                <p className="mb-1 mt-3 text-[16px] font-bold" style={{ color: PAPER }}>
                  <RichText text={hud.reveal.correctText} />
                </p>
              )}
              {hud.reveal.explanation && (
                <p className="my-2.5 max-w-[760px] text-[14px] leading-[1.6]" style={{ color: "#b2bfd3" }}>
                  <RichText text={hud.reveal.explanation} />
                </p>
              )}
              <button
                type="button"
                onClick={onContinue}
                className="mt-2 rounded-[10px] px-6 py-[15px] text-[14px] font-extrabold"
                style={{ background: MINT, color: "#172314" }}
              >
                Swing across
              </button>
            </div>
          ) : hud.awaitingRetry ? (
            <div className="pl-[22px]" style={{ borderLeft: "3px solid #ff8e93" }}>
              <span className="block text-[10px] font-extrabold uppercase tracking-[2.3px]" style={{ color: "#ff8e93" }}>
                The anchor snapped
              </span>
              {hud.miss?.misconception && (
                <p className="mb-1 mt-3 text-[16px] font-bold" style={{ color: PAPER }}>
                  {humanise(hud.miss.misconception)}
                </p>
              )}
              <p className="my-2.5 max-w-[760px] text-[14px] leading-[1.6]" style={{ color: "#b2bfd3" }}>
                <RichText text={hud.miss?.feedback ?? "That anchor will not hold. Rule it out and look again."} />
              </p>
              {hud.miss?.hint && (
                <p
                  className="my-3 max-w-[760px] rounded-[10px] px-4 py-3 text-[13px] leading-[1.6]"
                  style={{ background: "#1b2538", border: `1px solid ${LINE}`, color: "#cfe0ff" }}
                >
                  <strong style={{ color: MINT }}>Hint · </strong>
                  <RichText text={hud.miss.hint} />
                </p>
              )}
              <button
                type="button"
                onClick={onContinue}
                className="mt-2 rounded-[10px] px-6 py-[15px] text-[14px] font-extrabold"
                style={{ background: MINT, color: "#172314" }}
              >
                Try another anchor
              </button>
            </div>
          ) : q ? (
            <>
              <span className="block text-[10px] font-extrabold uppercase tracking-[2.3px]" style={{ color: MINT }}>
                {hud.conceptTitle}
              </span>
              <h2 className="my-3 mb-5 text-[18px] font-bold leading-[1.4] sm:text-[23px]">
                <RichText text={q.text} />
              </h2>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {q.options.map((o, i) => {
                  const out = hud.tried.includes(i);
                  const picked = hud.selected === i && !out;
                  const open = hud.phase === "question" || hud.phase === "move";
                  return (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={picked}
                      disabled={out || !open || hud.selected >= 0}
                      onClick={() => onChoose?.(o.id)}
                      className={cn(
                        "flex min-h-[68px] items-center gap-3 rounded-[10px] p-[10px] text-left text-[13px] font-bold transition-all sm:p-[14px] sm:text-[14px]",
                        out ? "cursor-not-allowed line-through opacity-45" : picked ? "" : "hover:-translate-y-[2px] disabled:hover:translate-y-0",
                        hud.selected >= 0 && !picked && !out && "opacity-60",
                      )}
                      style={{
                        border: `${picked ? 2 : 1}px solid ${out ? "#3a2b32" : picked ? MINT : LINE}`,
                        background: out ? "#1a1620" : picked ? "#1d2a1f" : "#151e30",
                        boxShadow: picked ? "0 0 0 4px rgba(195,241,140,0.12)" : undefined,
                        color: PAPER,
                      }}
                    >
                      <span
                        className="flex size-7 shrink-0 items-center justify-center rounded-[7px] text-[12px] font-extrabold"
                        style={{ background: out ? "#3a2b32" : picked ? MINT : "#222d45", color: out ? "#ff8e93" : picked ? "#172314" : MINT }}
                      >
                        {o.id}
                      </span>
                      <RichText text={o.text} />
                    </button>
                  );
                })}
              </div>
              <p className="mt-4 text-[12px]" style={{ color: hud.selected >= 0 ? MINT : MUTED }} aria-live="polite">
                {hud.selected >= 0
                  ? hud.phase === "move"
                    ? `Locked in ${q.options[hud.selected]?.id}. The web fires when you reach the gap.`
                    : `Shooting a web at ${q.options[hud.selected]?.id}…`
                  : hud.phase === "move"
                    ? "Pick your answer now. The web fires when you reach the gap."
                    : "Your answer picks the web anchor. A wrong one snaps, and you get another go."}
              </p>
            </>
          ) : (
            <p className="pt-10 text-center text-[13px]" style={{ color: MUTED }}>
              {hud.phase === "question" ? "" : "Swinging to the next gap…"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Misconceptions are stored as machine keys ("thickness-blocks-everything")
 * so the engine can track them. A student should read a sentence, not a slug.
 */
function humanise(key: string): string {
  const words = key.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function Stat({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "warn" }) {
  return (
    <div>
      <small className="mb-[7px] block text-[8px] uppercase tracking-[1.5px] sm:text-[9px]" style={{ color: MUTED }}>
        {label}
      </small>
      <b className="text-[18px] sm:text-[22px]" style={{ color: tone === "warn" ? "#ff7c83" : PAPER }}>
        {value}
      </b>
    </div>
  );
}
