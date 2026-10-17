import Link from "next/link";
import { connection } from "next/server";
import { Logo } from "@/components/brand/logo";
import { SpiderHero } from "@/components/landing/spider-hero";
import { ModeBadge } from "@/components/layout/app-nav";
import { Button } from "@/components/ui/button";
import { publicStatus } from "@/lib/config";
import { DEMO_QUEST_ID } from "@/lib/demo/collisions";

const STEPS = [
  { title: "Upload a chapter", body: "Photos of handwritten notes or a PDF. Equations and diagrams are read too." },
  { title: "Play it as a game", body: "Answer in Spider Climb, Force Rush, or plain question mode. Every answer key is checked before you see it." },
  { title: "Learn from what you miss", body: "A wrong answer gets a short explanation and a fresh question on the same idea." },
];

export default async function Landing() {
  // Render per request so the AI-mode note reflects runtime configuration.
  await connection();
  const status = publicStatus();
  const spiderDemo = `/quest/${DEMO_QUEST_ID}?world=spider-climb`;

  return (
    <>
      <header className="material-chrome sticky top-0 z-40 border-b border-line">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-5 t-subhead text-muted sm:flex" aria-label="Main">
            <Link href={spiderDemo} className="hover:text-ink">
              Demo
            </Link>
            <Link href="/dashboard" className="hover:text-ink">
              Chapters
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <ModeBadge aiAvailable={status.aiAvailable} />
            <Button asChild size="sm">
              <Link href="/create">New quest</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid max-w-5xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
          <div>
            <h1 className="max-w-xl t-display text-ink">Turn your notes into a game.</h1>
            <p className="mt-5 max-w-md t-body text-muted">
              Upload a chapter and QuestLearn writes questions from it. Then play them: in Spider Climb, every right answer swings you to the next rooftop.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/create">Create a quest</Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href={spiderDemo}>Play the demo</Link>
              </Button>
            </div>
            <p className="mt-4 t-footnote text-faint">No sign-up. Progress is saved on this device.</p>
          </div>
          <SpiderHero href={spiderDemo} />
        </section>

        <section className="border-t border-line">
          <ol className="mx-auto grid max-w-5xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-3 md:gap-12">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <p className="t-footnote text-faint tabular">0{i + 1}</p>
                <h2 className="mt-2 t-headline text-ink">{s.title}</h2>
                <p className="mt-1.5 t-subhead text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 t-footnote text-faint sm:px-6">
          <span>QuestLearn</span>
          <span className="sm:ml-auto">{status.aiAvailable ? "Questions by Gemini, checked by QuestLearn" : "Demo mode: prepared content only"}</span>
        </div>
      </footer>
    </>
  );
}
