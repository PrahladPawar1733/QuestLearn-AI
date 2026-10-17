"use client";

/**
 * End-of-run report.
 *
 * The two columns are the point of this screen: driving and learning are
 * reported side by side but never combined into one number. A student who
 * finished last while answering everything correctly should be able to see
 * that at a glance, and so should the reverse — which is only possible if the
 * two are never averaged together.
 */
import { ArrowRight, Flag, Gauge, RotateCcw, Timer, Trophy, Wind, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GameRunSummary } from "@/lib/game/types";

export function RunSummaryCard({
  summary,
  questTitle,
  onSeeLearning,
  onAgain,
}: {
  summary: GameRunSummary;
  questTitle: string;
  onSeeLearning: () => void;
  onAgain: () => void;
}) {
  const { game, learning, outcome } = summary;
  const position = game.extras?.finishPosition ?? 1;
  const accuracy = learning.answered > 0 ? Math.round((learning.correct / learning.answered) * 100) : null;

  return (
    <div className="w-full max-w-lg rounded-[1.75rem] bg-surface p-5 sm:p-6">
      <p className="t-caption font-semibold uppercase tracking-wider text-tint">
        {outcome === "finished" ? "Race complete" : "Run ended"}
      </p>
      <h2 className="mb-4 t-title1 text-ink">{questTitle}</h2>

      {/* ---------------- driving ---------------- */}
      <section className="mb-4">
        <h3 className="mb-2 flex items-center gap-1.5 t-headline text-ink">
          <Gauge className="size-4 text-tint" /> Driving
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat icon={<Trophy className="size-3.5" />} label="Finish" value={outcome === "finished" ? ordinal(position) : "—"} />
          <Stat icon={<Timer className="size-3.5" />} label="Time" value={formatTime(game.durationSec)} />
          <Stat icon={<Gauge className="size-3.5" />} label="Top speed" value={`${game.topSpeedKph} km/h`} />
          <Stat icon={<Flag className="size-3.5" />} label="Checkpoints" value={`${game.checkpointsPassed}/${game.checkpointsTotal}`} />
          <Stat icon={<Wind className="size-3.5" />} label="Drift" value={`${game.extras?.driftMetres ?? 0} m`} />
          <Stat icon={<Zap className="size-3.5" />} label="Score" value={game.score.toLocaleString()} />
        </div>
        {game.crashes > 0 && (
          <p className="mt-2 t-footnote text-faint">
            {game.crashes} collision{game.crashes === 1 ? "" : "s"} — these affect your race score only, never your mastery.
          </p>
        )}
      </section>

      {/* ---------------- learning ---------------- */}
      <section className="mb-5 rounded-2xl bg-tint/8 p-3.5 ring-1 ring-tint/20">
        <h3 className="mb-2 t-headline text-ink">Learning</h3>
        {learning.answered === 0 ? (
          <p className="t-subhead text-muted">No checkpoints were answered this run, so nothing changed in your mastery.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Answered" value={String(learning.answered)} />
              <Stat label="Correct" value={accuracy !== null ? `${learning.correct} · ${accuracy}%` : String(learning.correct)} />
              <Stat label="Fixed after a miss" value={String(learning.recoveriesFixed)} />
            </div>
            {learning.recoveriesFixed > 0 && (
              <p className="mt-2 t-footnote text-muted">
                You turned {learning.recoveriesFixed} miss{learning.recoveriesFixed === 1 ? "" : "es"} into a correct answer on the
                second try. That is the part that moves mastery most.
              </p>
            )}
          </>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onAgain}>
          <RotateCcw /> Race again
        </Button>
        <Button size="lg" className="flex-1" onClick={onSeeLearning}>
          See what you learned <ArrowRight />
        </Button>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-2.5 py-2">
      <span className="flex items-center gap-1 t-caption text-muted">
        {icon}
        {label}
      </span>
      <span className="mt-0.5 block font-rounded t-headline tabular text-ink">{value}</span>
    </div>
  );
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
