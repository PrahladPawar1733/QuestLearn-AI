import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ResultsView } from "@/components/game/results-view";
import { AppShell } from "@/components/layout/app-shell";
import { requireUid } from "@/lib/identity";
import { orNotFound } from "@/lib/server-data";
import { sessionResults } from "@/lib/services/play";

export const metadata: Metadata = { title: "Quest results · QuestLearn AI" };

export default async function ResultsPage(props: PageProps<"/quest/[id]/results">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const sessionId = typeof sp.session === "string" ? sp.session : null;
  if (!sessionId) redirect(`/quest/${id}`);
  const uid = await requireUid();
  const r = await orNotFound(sessionResults(uid, sessionId));
  if (r.session.status !== "completed") redirect(`/quest/${id}?session=${sessionId}`);
  return (
    <AppShell>
      <ResultsView
        questId={id}
        data={{
          quest: r.quest,
          kind: r.session.kind,
          world: r.session.world,
          totals: r.totals,
          perConcept: r.perConcept,
          weakConceptIds: r.weakConceptIds,
          adaptations: r.adaptations,
          achievements: r.achievements,
          recommendation: r.recommendation,
        }}
      />
    </AppShell>
  );
}
