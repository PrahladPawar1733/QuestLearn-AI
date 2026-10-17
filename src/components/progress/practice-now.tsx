"use client";

import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api-client";
import type { SessionView } from "@/lib/services/play";

/**
 * One tap from "this needs revision" to actually practising it, instead of
 * routing through the concept page and a second button (backlog ON-12).
 */
export function PracticeNow({
  questId,
  conceptIds,
  label = "Practise now",
  size = "sm",
  variant = "tinted",
  className,
}: {
  questId: string;
  conceptIds: string[];
  label?: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "tinted" | "secondary";
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className={className}>
      <Button
        size={size}
        variant={variant}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const v = await api<SessionView>(`/api/quests/${questId}/start`, {
              method: "POST",
              json: { world: "classic", practiceConceptIds: conceptIds },
              retries: 0,
            });
            router.push(`/quest/${questId}?session=${v.session.id}`);
          } catch (e) {
            setError(e instanceof ApiError ? e.message : "Couldn't start practice.");
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {error ? "Try again" : label}
      </Button>
      {error && (
        <span role="alert" className="mt-1.5 flex items-start gap-1.5 t-footnote text-ink">
          <AlertTriangle className="mt-px size-3.5 shrink-0 text-danger" aria-hidden /> {error}
        </span>
      )}
    </span>
  );
}
