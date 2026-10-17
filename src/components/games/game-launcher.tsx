"use client";

/**
 * Resolves a game module from the registry, then hands it to the shared host.
 *
 * The quest page used to import `CarRushPlayer` directly, which meant every
 * game needed a code change there and three.js was reachable from a server
 * component. Going through the registry keeps games lazily loaded and makes
 * adding one a data change.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SessionView } from "@/lib/services/play";
import type { GameId } from "@/lib/game/types";
import { GamePlayer } from "./game-player";
import { gameListing, type AnyGameModule } from "./registry";

export function GameLauncher({
  initial,
  gameId,
  concepts,
}: {
  initial: SessionView;
  gameId: GameId;
  concepts?: { id: string; title: string; description: string }[];
}) {
  const listing = gameListing(gameId);
  const [mod, setMod] = useState<AnyGameModule | null>(null);
  // Derived, not state: an unknown id is knowable during render, so setting it
  // from an effect would just cause an extra render pass.
  const [loadError, setLoadError] = useState<string | null>(null);
  const error = listing ? loadError : `Unknown game "${gameId}".`;

  useEffect(() => {
    let cancelled = false;
    if (!listing) return;
    listing
      .load()
      .then((m) => {
        if (!cancelled) setMod(m.default);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "That game could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, listing]);

  if (error) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-bg p-6">
        <div className="w-full max-w-sm rounded-[1.75rem] bg-surface p-5 text-center">
          <h1 className="mb-1 t-title3 text-ink">That game isn&apos;t available</h1>
          <p className="mb-4 t-subhead text-muted">{error}</p>
          <Button size="lg" className="w-full" asChild>
            <a href={`/quest/${initial.quest.id}?world=classic`}>Play in Focus instead</a>
          </Button>
        </div>
      </div>
    );
  }

  if (!mod) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#06080f]">
        <p className="t-subhead text-white/70">Loading the game…</p>
      </div>
    );
  }

  return <GamePlayer initial={initial} module={mod} concepts={concepts} />;
}
