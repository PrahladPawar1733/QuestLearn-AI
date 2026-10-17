import { BarChart3, Brain, ChevronRight, FileUp, Gauge, Gamepad2, Layers, LineChart, NotebookPen, Sparkles, Wand2 } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Logo } from "@/components/brand/logo";
import { WORLDS } from "@/components/game/types";
import { WorldPreview } from "@/components/game/world-preview";
import { HeroPreview } from "@/components/landing/hero-preview";
import { ModeBadge } from "@/components/layout/app-nav";
import { Button } from "@/components/ui/button";
import { publicStatus } from "@/lib/config";
import { cn } from "@/lib/cn";
import { demoConcepts, demoQuestions, DEMO_QUEST_ID } from "@/lib/demo/collisions";
import { toPublicQuestion } from "@/lib/services/public";

const STEPS = [
  { icon: FileUp, title: "Upload your chapter", body: "Photos of handwritten notes or a PDF. Handwriting, equations and diagrams are all read." },
  { icon: Wand2, title: "AI builds your quest", body: "Gemini finds the key concepts and writes questions. Every answer key is checked before you see it." },
  { icon: Gamepad2, title: "Play, learn, master", body: "Slip up and you get a short lesson and a fresh question on the same idea. Mastery updates as you go." },
];

const FEATURES = [
  { icon: NotebookPen, color: "bg-blue", title: "Your own notes", body: "Questions come from your material, with page references." },
  { icon: Sparkles, color: "bg-purple", title: "AI-generated questions", body: "Concept, numerical and reasoning. Every wrong option targets a real misconception." },
  { icon: Brain, color: "bg-pink", title: "Personal explanations", body: "Learn why your choice was tempting, then work through the solution step by step." },
  { icon: Layers, color: "bg-teal", title: "Physics you can see", body: "Collision diagrams computed from the physics, with a conservation check." },
  { icon: Gauge, color: "bg-amber-fill", title: "Adaptive difficulty", body: "Two right in a row and it steps up. Struggling, and it slows down with you." },
  { icon: LineChart, color: "bg-success-fill", title: "Honest mastery", body: "A transparent score that needs repeated success, not one lucky answer." },
];

const SUBJECTS = [
  { name: "Physics", note: "Demo chapter: Collisions", href: `/quest/${DEMO_QUEST_ID}`, cta: "Play demo", color: "bg-tint" },
  { name: "Chemistry", note: "Upload your notes", href: "/create?subject=Chemistry", cta: "Create", color: "bg-teal" },
  { name: "Mathematics", note: "Upload your notes", href: "/create?subject=Mathematics", cta: "Create", color: "bg-blue" },
  { name: "Biology", note: "Upload your notes", href: "/create?subject=Biology", cta: "Create", color: "bg-success-fill" },
];

export default async function Landing() {
  // Render per request so the AI-mode badge reflects runtime configuration.
  await connection();
  const status = publicStatus();
  const q = demoQuestions().find((x) => x.id === "demo-q05")!;
  const concept = demoConcepts().find((c) => c.id === q.conceptId);
  const preview = toPublicQuestion(q, concept);

  return (
    <>
      <header className="material-chrome scroll-edge sticky top-0 z-40">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-1 t-subhead text-muted md:flex" aria-label="Main">
            <a href="#how" className="rounded-full px-3 py-1.5 hover:text-ink">How it works</a>
            <a href="#subjects" className="rounded-full px-3 py-1.5 hover:text-ink">Explore subjects</a>
            <Link href="/dashboard" className="rounded-full px-3 py-1.5 hover:text-ink">My learning</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ModeBadge aiAvailable={status.aiAvailable} />
            <Button asChild size="sm">
              <Link href="/create">Start learning</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-24">
          <p className="t-headline text-tint">Upload. Play. Understand. Master.</p>
          <h1 className="mx-auto mt-3 max-w-4xl t-display text-ink">Turn Your Notes Into Your Next Quest.</h1>
          <p className="mx-auto mt-5 max-w-xl t-title3 font-normal text-muted">Upload your study material. Play through what matters. Learn from every mistake.</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button asChild size="lg" className="rounded-full px-7">
              <Link href="/create">Create My First Quest</Link>
            </Button>
            <Link href={`/quest/${DEMO_QUEST_ID}`} className="pressable inline-flex items-center gap-0.5 t-body font-medium text-tint hover:underline">
              Try a Demo Quest <ChevronRight className="size-4" />
            </Link>
          </div>
          <p className="mt-4 t-footnote text-faint">No sign-up. Your guest progress is saved on this device.</p>
          <div className="mx-auto mt-14 max-w-2xl text-left">
            <HeroPreview question={preview} />
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-16 bg-surface py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center t-large-title text-ink">How it works</h2>
            <ol className="mt-12 grid gap-10 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="text-center">
                  <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-tint/12 text-tint">
                    <s.icon className="size-6" />
                  </span>
                  <p className="mt-4 t-caption font-semibold text-faint">Step {i + 1}</p>
                  <h3 className="mt-1 t-title3 text-ink">{s.title}</h3>
                  <p className="mx-auto mt-2 max-w-xs t-callout text-muted">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="max-w-2xl t-large-title text-ink">More than a quiz. A learning loop.</h2>
          <p className="mt-3 max-w-2xl t-body text-muted">Your notes become concepts and questions. Each answer is checked, each mistake is diagnosed and taught, and a follow-up question checks the fix.</p>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="surface rounded-[1.25rem] p-5">
                <span className={cn("flex size-9 items-center justify-center rounded-[0.6rem] text-white", f.color)}>
                  <f.icon className="size-5" />
                </span>
                <h3 className="mt-4 t-headline text-ink">{f.title}</h3>
                <p className="mt-1 t-subhead text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Demo + worlds */}
        <section id="demo" className="scroll-mt-16 bg-surface py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="t-large-title text-ink">Play the Collisions demo</h2>
                <p className="mt-2 max-w-2xl t-body text-muted">Grade 11 Physics: 6 concepts and 14 checked questions. No account or upload needed. Pick a world to play in.</p>
              </div>
              <Button asChild size="lg" className="rounded-full">
                <Link href={`/quest/${DEMO_QUEST_ID}`}>Start the demo</Link>
              </Button>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              {WORLDS.map((w) => (
                <Link key={w.id} href={`/quest/${DEMO_QUEST_ID}?world=${w.id}`} className="pressable overflow-hidden rounded-[1.25rem] bg-bg">
                  <div className={cn("h-20", w.accent)}>
                    <WorldPreview world={w.id} />
                  </div>
                  <p className="px-3 py-2.5 t-subhead font-semibold text-ink">
                    {w.emoji} {w.name}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Subjects: inset-grouped list */}
        <section id="subjects" className="mx-auto max-w-3xl scroll-mt-16 px-4 py-20 sm:px-6">
          <h2 className="mb-6 t-large-title text-ink">Explore subjects</h2>
          <ul className="surface divide-y divide-line overflow-hidden rounded-[1.25rem]">
            {SUBJECTS.map((s) => (
              <li key={s.name}>
                <Link href={s.href} className="flex items-center gap-3 px-4 py-3.5 active:bg-fill-4">
                  <span className={cn("flex size-8 items-center justify-center rounded-lg font-rounded t-subhead font-bold text-white", s.color)}>{s.name[0]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block t-headline text-ink">{s.name}</span>
                    <span className="block t-footnote text-muted">{s.note}</span>
                  </span>
                  <span className="t-subhead text-tint">{s.cta}</span>
                  <ChevronRight className="size-4 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 t-footnote text-muted sm:flex-row sm:items-center sm:px-6">
          <Logo className="t-subhead" />
          <p className="sm:ml-auto">
            {status.aiAvailable ? `Gemini (${status.model}) on ${status.aiMode === "vertex" ? "Vertex AI" : "Gemini API"}` : "Demo mode: prepared content, no AI calls"} ·{" "}
            <Link href="/progress" className="hover:text-ink">
              <BarChart3 className="mr-1 inline size-3.5" />
              Progress
            </Link>
          </p>
        </div>
      </footer>
    </>
  );
}
