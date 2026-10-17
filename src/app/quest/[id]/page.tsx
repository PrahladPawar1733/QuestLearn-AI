import type { Metadata } from "next";
import { QuestLobby } from "@/components/game/quest-lobby";
import { QuestPlayer } from "@/components/game/quest-player";
import { GameLauncher } from "@/components/games/game-launcher";
import { AppShell } from "@/components/layout/app-shell";
import { publicStatus } from "@/lib/config";
import { db } from "@/lib/db";
import { requireUid } from "@/lib/identity";
import { orNotFound } from "@/lib/server-data";
import { loadQuest, loadSession } from "@/lib/services/access";
import { viewSession } from "@/lib/services/play";
import { GameWorld, isRealtimeGame, type Concept, type Material, type Question, type RealtimeGame, type Session } from "@/lib/types";

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
    // A real-time game takes over the whole viewport and brings its own
    // chrome, so it is rendered outside AppShell (no nav bar over the canvas).
    if (isRealtimeGame(session.world)) {
      // Concept descriptions travel with the session so a checkpoint can
      // restate the idea before asking about it.
      const sessionConcepts = await db().getMany<Concept>("concepts", quest.conceptIds);
      return (
        <GameLauncher
          key={session.id}
          initial={view}
          gameId={session.world as RealtimeGame}
          concepts={sessionConcepts.map((c) => ({ id: c.id, title: c.title, description: c.description }))}
        />
      );
    }
    return (
      <AppShell>
        <QuestPlayer key={session.id} initial={view} videoEnabled={publicStatus().videoEnabled} />
      </AppShell>
    );
  }

  // The material carries the extracted chapter brief (summary, concepts,
  // definitions, formulas, worked examples). It was never loaded here, which
  // is why none of it was ever shown to a student before they played.
  const [concepts, questions, sessions, material] = await Promise.all([
    db().getMany<Concept>("concepts", quest.conceptIds),
    db().getMany<Question>("questions", quest.questionIds),
    db().list<Session>("sessions", { ownerId: uid, questId: quest.id }, { orderBy: "startedAt", desc: true }),
    db().get<Material>("materials", quest.materialId),
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
        extracted={material?.extracted ?? null}
      />
    </AppShell>
  );
}
