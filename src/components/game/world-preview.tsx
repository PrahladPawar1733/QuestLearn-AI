import type { GameWorld } from "@/lib/types";

/**
 * Small decorative scene thumbnails for the world picker. Flat shapes in
 * system colors; neutrals use tokens so they read on light and dark tiles.
 */
/**
 * Thumbnail for the Focus experience. The five decorative scene thumbnails
 * were removed with their worlds. Spider Climb draws its own canvas band
 * instead of needing a thumbnail.
 */
export function WorldPreview({ world }: { world: GameWorld }) {
  void world;
  return (
    <svg viewBox="0 0 200 80" className="h-full w-full" aria-hidden="true">
      <rect x="24" y="14" width="152" height="16" rx="6" className="fill-fill-3" />
      <rect x="24" y="38" width="70" height="12" rx="5" className="fill-tint" />
      <rect x="100" y="38" width="76" height="12" rx="5" className="fill-fill-3" />
      <rect x="24" y="56" width="76" height="12" rx="5" className="fill-fill-3" />
      <rect x="106" y="56" width="70" height="12" rx="5" className="fill-fill-3" />
    </svg>
  );
}
