import type { Metadata } from "next";
import { QuestLobby } from "@/components/game/quest-lobby";
import { QuestPlayer } from "@/components/game/quest-player";
import { AppShell } from "@/components/layout/app-shell";
import { publicStatus } from "@/lib/config";
import { db } from "@/lib/db";
import { requireUid } from "@/lib/identity";
import { orNotFound } from "@/lib/server-data";
import { loadQuest, loadSession } from "@/lib/services/access";
import { viewSession } from "@/lib/services/play";
import { GameWorld, type Concept, type Question, type Session } from "@/lib/types";

export const metadata: Metadata = { title: "Quest · QuestLearn AI" };

export default async function QuestPage(props: PageProps<"/quest/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const uid = await requireUid();
  const quest = await orNotFound(loadQuest(id, uid));
  const sessionId = typeof sp.session === "string" ? sp.session : null;

  if (sessionId) {
    const session = await orNotFound(loadSession(sessionId, uid));
    const view = await viewSession(session, quest);
    return (
      <AppShell>
        <QuestPlayer key={session.id} initial={view} videoEnabled={publicStatus().videoEnabled} />
      </AppShell>
    );
  }

  const [concepts, questions, sessions] = await Promise.all([
    db().getMany<Concept>("concepts", quest.conceptIds),
    db().getMany<Question>("questions", quest.questionIds),
    db().list<Session>("sessions", { ownerId: uid, questId: quest.id }, { orderBy: "startedAt", desc: true }),
  ]);
  const active = sessions.find((s) => s.status === "active" && s.kind === "quest");
  return (
    <AppShell>
      <QuestLobby
        quest={{ id: quest.id, title: quest.title, subject: quest.subject, grade: quest.grade, origin: quest.origin, playLength: quest.playLength, questionCount: questions.length, rejectedCount: quest.rejectedCount }}
        concepts={concepts.map((c) => ({ id: c.id, title: c.title, description: c.description, fromNotes: c.fromNotes, questions: questions.filter((q) => q.conceptId === c.id).length }))}
        active={active ? { id: active.id, answered: active.answers.filter((a) => !a.isFollowUp).length, world: active.world } : null}
        completedRuns={sessions.filter((s) => s.status === "completed").length}
        defaultWorld={GameWorld.safeParse(sp.world).success ? (sp.world as GameWorld) : undefined}
      />
    </AppShell>
  );
}
