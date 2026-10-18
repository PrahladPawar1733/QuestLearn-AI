"use client";

/**
 * Force Rush — the page.
 *
 * Every colour, size, radius, letter-spacing and keyframe here is lifted from
 * the author's original "Force Rush.html": the ink ground (#15161c), the panel
 * (#1d1e26) with its 2px line (#3a3b48) and 6px shadow lip (#0c0c10), the hot
 * pink (#ff3fa0), the green (#7dff9a) and the amber (#ffd166), Archivo Black
 * for the headings, Chakra Petch for prose, JetBrains Mono for anything
 * numeric, and the three `fr-pop` / `fr-drop` / `fr-blink` animations.
 *
 * What changed is only the arrangement, because the app hosts the canvas as a
 * BAND at the top of a scrolling page rather than as a full-screen backdrop:
 * the author's floating HUD row becomes the page header above the band, and
 * their question panel sits beneath it as real DOM. Everything a student reads
 * is HTML — selectable text, real buttons, focus rings, screen-reader
 * support — which is the main reason this layout beats painting into canvas.
 *
 * Tokens are inlined rather than taken from the app's palette on purpose:
 * this is the author's skin and it must look like itself whatever theme the
 * rest of the app is in.
 */
import { RichText } from "@/components/math/rich-text";
import { LanguageSelect, ListenButton, useTranslated } from "@/lib/language/client";
import type { GameHudProps } from "@/lib/game/module";
import type { ForceRushHud } from "./game";

/* ---- the author's palette ---- */
const INK = "#15161c";
const PANEL = "#1d1e26";
const LINE = "#3a3b48";
const LIP = "#0c0c10";
const PAPER = "#f4f2f5";
const MUTED = "#9a97a3";
const SOFT = "#cfcbd6";
const PINK = "#ff3fa0";
const AMBER = "#ffd166";
const GREEN = "#7dff9a";
const MONO_BG = "#12131a";

/* ---- the author's type stack ---- */
const DISPLAY = "'Archivo Black', 'Arial Black', Impact, sans-serif";
const BODY = "'Chakra Petch', 'Trebuchet MS', sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace";

/** The max-width and padding the host uses for the canvas band, so the drawing
 * lines up exactly inside the frame drawn here. */
const BAND = "mx-auto w-full max-w-[1500px] px-[4%] sm:px-[5%]";

/**
 * The author's own keyframes and hover/active states, plus the three Google
 * fonts the original embedded. The canvas draws text in two of them too, so
 * they have to be loaded in the document, not just applied here.
 */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Chakra+Petch:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
@keyframes fr-pop{from{transform:translateY(30px) scale(.96);opacity:0}to{transform:none;opacity:1}}
@keyframes fr-drop{from{transform:translate(-50%,-40px) scale(.9);opacity:0}to{transform:translate(-50%,0) scale(1);opacity:1}}
@keyframes fr-blink{0%,100%{opacity:1}50%{opacity:.35}}
.fr-pop{animation:fr-pop .3s cubic-bezier(.2,.9,.3,1.2)}
.fr-drop{animation:fr-drop .3s cubic-bezier(.2,.9,.3,1.2)}
.fr-blink{animation:fr-blink 1s infinite}
.fr-opt{transition:transform .08s,background .12s,border-color .12s}
.fr-opt:not(:disabled):hover{border-color:${PINK};transform:translateY(-2px)}
.fr-opt:not(:disabled):active{border-bottom-width:2px;transform:translateY(4px)}
.fr-opt:focus-visible{outline:2px solid ${AMBER};outline-offset:3px}
.fr-go{transition:filter .12s,transform .08s}
.fr-go:hover{filter:brightness(1.1)}
.fr-go:active{border-bottom-width:1px;transform:translateY(4px)}
.fr-go:focus-visible{outline:2px solid ${PAPER};outline-offset:3px}
`;

export function ForceRushHudView({ hud, onChoose, onContinue }: GameHudProps<ForceRushHud>) {
  const q0 = hud.question;
  const answering = hud.showQuestion && hud.phase === "question";
  // Learning content follows the game's language picker (cached; instant after the first time).
  const { texts: tx } = useTranslated([q0?.text ?? "", hud.conceptTitle ?? "", hud.cardText ?? "", hud.cardExplain ?? "", ...hud.options.map((o) => o.text)]);
  const q = q0 && { ...q0, text: tx[0] || q0.text };
  const optionText = (i: number, fallback: string) => tx[4 + i] || fallback;

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col" style={{ color: PAPER, fontFamily: BODY }}>
      <style>{CSS}</style>

      {/* ---------------- the author's HUD row ----------------
          The ink ground is painted in two strips, above and below the band,
          rather than on the root: the host draws the canvas BEHIND the HUD, so
          a background on the root would hide the game. */}
      <div style={{ background: INK }}>
        <div className={BAND}>
          <div className="flex h-[86px] items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-[10px]">
                <span style={{ fontFamily: DISPLAY, fontSize: 12, letterSpacing: ".18em", color: PINK }}>
                  {hud.classLabel}
                </span>
                <span className="truncate uppercase" style={{ fontFamily: DISPLAY, fontSize: 20, letterSpacing: ".02em" }}>
                  {hud.chapterTitle}
                </span>
              </div>
              <div className="flex items-center gap-[6px]">
                {hud.dots.map((d, i) => (
                  <i key={i} className="h-[6px] w-[30px] rounded-[3px]" style={{ background: d.color }} />
                ))}
                <span className="ml-[6px]" style={{ fontSize: 11, letterSpacing: ".14em", color: MUTED }}>
                  CHECKPOINTS
                </span>
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center gap-[18px]">
              <LanguageSelect dark />
              <div className="text-right">
                <div style={{ fontSize: 11, letterSpacing: ".16em", color: MUTED }}>HEALTH</div>
                <div className="mt-[4px] flex justify-end gap-[5px]">
                  {hud.hearts.map((h, i) => (
                    <i key={i} className="block size-[18px] rotate-45 rounded-[4px]" style={{ background: h.color }} />
                  ))}
                </div>
              </div>
              <div className="text-right">
                <div style={{ fontSize: 11, letterSpacing: ".16em", color: MUTED }}>SPEED</div>
                <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 500, lineHeight: 1.2 }}>
                  <span className="tabular-nums">{hud.speed}</span>
                  <span style={{ fontSize: 12, color: MUTED }}> m/s</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- the stage band ----------------
          The host paints the canvas behind this; the box only reserves the
          space and holds the frame, the tier chip and the verdict banner, and
          stays transparent so the drive shows through. */}
      <div className={BAND}>
        <div
          className="relative overflow-hidden rounded-[18px]"
          data-game-stage
          style={{ height: "clamp(270px,43vh,470px)", border: `1px solid ${LINE}`, background: "transparent" }}
        >
          <div
            className="pointer-events-none absolute left-[14px] top-[12px]"
            style={{ fontSize: 11, letterSpacing: ".14em", color: hud.tierColor }}
          >
            {hud.tierLabel}
          </div>

          {hud.showVerdict && (
            <div
              className="fr-drop pointer-events-none absolute left-1/2 top-[14px] flex items-center gap-[14px] whitespace-nowrap rounded-[14px] px-[22px] py-[12px]"
              style={{ background: hud.verdictBg, color: INK, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}
            >
              <span style={{ fontFamily: DISPLAY, fontSize: 26, lineHeight: 1 }}>{hud.verdictTitle}</span>
              <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 500, opacity: 0.85 }}>{hud.verdictSub}</span>
            </div>
          )}
        </div>
      </div>

      {/* ---------------- the author's question panel ---------------- */}
      <div className="flex-1" style={{ background: INK }}>
        <div className={BAND}>
          <div className="flex justify-center px-[2px] pb-[26px] pt-[18px]">
            <div
              className="fr-pop w-full max-w-[760px] rounded-[18px] px-[22px] pb-[22px] pt-[20px]"
              style={{ background: PANEL, border: `2px solid ${LINE}`, boxShadow: "0 24px 60px rgba(0,0,0,.55)" }}
            >
              <div className="mb-[10px] flex items-center justify-between gap-[10px]">
                <div className="flex items-center gap-[10px]">
                  <i
                    className={answering ? "fr-blink block size-[9px] rounded-full" : "block size-[9px] rounded-full"}
                    style={{ background: answering ? PINK : LINE }}
                  />
                  <span
                    style={{ fontSize: 11, letterSpacing: ".18em", color: answering ? PINK : MUTED, fontWeight: 700 }}
                  >
                    {hud.obstacleWarning}
                  </span>
                </div>
                {hud.timed && answering && (
                  <div style={{ fontFamily: MONO, fontSize: 16, color: AMBER }}>
                    <span className="tabular-nums">{hud.qLeft}</span>s
                  </div>
                )}
              </div>

              {q ? (
                <>
                  {hud.conceptTitle && (
                    <div className="mb-[8px]" style={{ fontSize: 11, letterSpacing: ".16em", color: MUTED }}>
                      {(tx[1] || hud.conceptTitle).toUpperCase()}
                    </div>
                  )}
                  <h2 className="mb-[10px]" style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.35 }}>
                    <RichText text={q.text} />
                  </h2>
                  <ListenButton
                    dark
                    key={q0?.id}
                    className="mb-[14px]"
                    label="Read aloud"
                    text={`${q.text} ${hud.options.map((o, i) => `${o.id}: ${optionText(i, o.text)}.`).join(" ")}`}
                  />
                  <div className="grid gap-[12px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
                    {hud.options.map((o, oi) => (
                      <button
                        key={o.id}
                        type="button"
                        className="fr-opt flex min-h-[60px] items-center justify-center rounded-[12px] px-[14px] py-[10px] text-center"
                        disabled={!answering || o.out}
                        onClick={() => onChoose?.(o.id)}
                        style={{
                          background: o.bg,
                          border: "2px solid #444556",
                          borderBottom: `6px solid ${LIP}`,
                          fontFamily: MONO,
                          fontSize: 17,
                          fontWeight: 500,
                          color: o.fg,
                          textDecoration: o.deco,
                          cursor: answering ? o.cursor : "default",
                          lineHeight: 1.3,
                        }}
                      >
                        <RichText text={optionText(oi, o.text)} />
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                /* The author's own three lines about how a run works. */
                <div className="flex flex-wrap gap-[16px]" style={{ fontSize: 13, color: SOFT }}>
                  <span className="flex items-center gap-[8px]">
                    <i className="block size-[14px] rotate-45 rounded-[3px]" style={{ background: PINK }} />
                    3 health per chapter
                  </span>
                  <span className="flex items-center gap-[8px]">
                    <i className="block size-[14px] rounded-full" style={{ background: GREEN }} />
                    Checkpoint at every obstacle
                  </span>
                  <span className="flex items-center gap-[8px]">
                    <i
                      className="block size-[14px]"
                      style={{ background: AMBER, clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)" }}
                    />
                    Warning sign tells you what&apos;s ahead
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- the author's explanation card ---------------- */}
      {hud.showCard && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center overflow-y-auto p-4"
          style={{ background: "rgba(21,22,28,.55)" }}
        >
          <div
            role="dialog"
            aria-label={hud.cardTitle}
            className="fr-pop w-full max-w-[560px] rounded-[18px] px-[28px] py-[26px]"
            style={{
              background: PANEL,
              border: `2px solid ${hud.cardColor}`,
              boxShadow: "0 24px 60px rgba(0,0,0,.6)",
            }}
          >
            <div className="mb-[12px]" style={{ fontFamily: DISPLAY, fontSize: 38, lineHeight: 1, color: hud.cardColor }}>
              {hud.cardTitle}
            </div>
            <div className="mb-[14px]" style={{ fontSize: 17, lineHeight: 1.45 }}>
              <RichText text={tx[2] || hud.cardText} />
            </div>
            {hud.cardHasExplain && (
              <div
                className="mb-[20px] whitespace-pre-wrap rounded-[10px] px-[16px] py-[14px]"
                style={{ background: MONO_BG, fontFamily: MONO, fontSize: 14, lineHeight: 1.55, color: SOFT }}
              >
                <RichText text={tx[3] || hud.cardExplain} />
              </div>
            )}
            <button
              type="button"
              className="fr-go inline-flex min-h-[52px] items-center justify-center rounded-[12px] px-[28px]"
              onClick={() => {
                hud.advance?.();
                // Only the reveal card ends the question; the retry and
                // drive-on cards stay inside the run.
                if (hud.cardCloses) onContinue?.();
              }}
              style={{
                background: hud.cardColor,
                color: INK,
                fontFamily: DISPLAY,
                fontSize: 15,
                letterSpacing: ".06em",
                borderBottom: "5px solid rgba(0,0,0,.45)",
              }}
            >
              {hud.cardButton}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
