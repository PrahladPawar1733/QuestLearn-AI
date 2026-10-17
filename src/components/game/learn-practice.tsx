"use client";

import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api-client";
import type { SessionView } from "@/lib/services/play";

export function LearnPractice({ questId, conceptId }: { questId: string; conceptId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        size="lg"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const v = await api<SessionView>(`/api/quests/${questId}/start`, { method: "POST", json: { world: "classic", practiceConceptIds: [conceptId] }, retries: 0 });
            router.push(`/quest/${questId}?session=${v.session.id}`);
          } catch (e) {
            setError(e instanceof ApiError ? e.message : "Couldn't start practice.");
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {error ? "Try again" : "Practise this concept"}
      </Button>
      {error && (
        <p role="alert" className="flex max-w-sm items-start gap-2 rounded-xl bg-danger-fill/12 px-3 py-2 t-footnote text-ink">
          <AlertTriangle className="mt-px size-4 shrink-0 text-danger" aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}
