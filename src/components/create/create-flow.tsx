"use client";

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  ChevronsUpDown,
  FileText,
  Gamepad2,
  ImageIcon,
  Loader2,
  Play,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Tex } from "@/components/math/rich-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { DEMO_QUEST_ID } from "@/lib/demo/collisions";
import { spring } from "@/lib/motion";
import type { DifficultyPreference, ExtractedContent, ProcessingStage, Subject } from "@/lib/types";
import { SUBJECTS } from "@/lib/types";

interface LocalFile {
  id: string;
  file: File;
  kind: "pdf" | "image";
  url?: string;
  pages?: number | null;
  error?: string;
}

interface MaterialDTO {
  id: string;
  title: string;
  stage: ProcessingStage;
  completedStages: ProcessingStage[];
  error?: { code: string; message: string; stage: ProcessingStage; retryable: boolean };
  questId?: string;
  files: { index: number; name: string; mimeType: string; sizeBytes: number; pageCount?: number }[];
  extracted?: ExtractedContent;
}

const STAGES: { id: ProcessingStage; label: string; detail: string }[] = [
  { id: "reading", label: "Reading your material", detail: "Transcribing handwriting, equations and diagrams" },
  { id: "concepts", label: "Identifying concepts", detail: "Finding key ideas, formulas and examples" },
  { id: "questions", label: "Building your questions", detail: "Writing questions, then checking every answer key" },
  { id: "preparing", label: "Preparing your quest", detail: "Saving validated questions and concepts" },
];

const GRADES = ["8", "9", "10", "11", "12", "Other"];
const GOALS = ["School exam", "JEE / NEET foundation", "Board exam revision", "Understand the chapter"];

function uid() {
  return Math.random().toString(36).slice(2);
}

export function CreateFlow({
  aiAvailable,
  initialSubject,
  resumeMaterialId,
  limits,
}: {
  aiAvailable: boolean;
  initialSubject: Subject;
  resumeMaterialId: string | null;
  limits: { maxFileMB: number; maxTotalMB: number; maxFiles: number };
}) {
  const router = useRouter();
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState<Subject>(initialSubject);
  const [grade, setGrade] = useState("11");
  const [goal, setGoal] = useState("");
  const [difficulty, setDifficulty] = useState<DifficultyPreference>("mixed");
  const [count, setCount] = useState(10);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [material, setMaterial] = useState<MaterialDTO | null>(null);
  const [pipelineError, setPipelineError] = useState<ApiError | null>(null);
  const [running, setRunning] = useState(false);
  const [quest, setQuest] = useState<{ id: string; questionCount: number; playLength: number; rejectedCount: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragIndex = useRef<number | null>(null);

  // Revoke object URLs on unmount.
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  useEffect(() => () => filesRef.current.forEach((f) => f.url && URL.revokeObjectURL(f.url)), []);

  const addFiles = useCallback(
    async (list: FileList | File[]) => {
      setFormError(null);
      const incoming = Array.from(list);
      const next: LocalFile[] = [];
      for (const file of incoming) {
        const name = file.name.toLowerCase();
        const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
        const isImg = ["image/jpeg", "image/png"].includes(file.type) || /\.(jpe?g|png)$/.test(name);
        if (!isPdf && !isImg) {
          setFormError(`"${file.name}" isn't supported. Use PDF, JPG or PNG.`);
          continue;
        }
        if (file.size > limits.maxFileMB * 1024 * 1024) {
          setFormError(`"${file.name}" is larger than ${limits.maxFileMB} MB.`);
          continue;
        }
        next.push({ id: uid(), file, kind: isPdf ? "pdf" : "image", url: isImg ? URL.createObjectURL(file) : undefined, pages: isPdf ? null : undefined });
      }
      setFiles((prev) => {
        const merged = [...prev, ...next];
        if (merged.length > limits.maxFiles) {
          setFormError(`You can upload up to ${limits.maxFiles} files at once.`);
          return merged.slice(0, limits.maxFiles);
        }
        return merged;
      });
      // PDF page counts (read locally; nothing leaves the device until you press Create)
      for (const f of next.filter((x) => x.kind === "pdf")) {
        try {
          const { PDFDocument } = await import("pdf-lib");
          const doc = await PDFDocument.load(await f.file.arrayBuffer(), { updateMetadata: false });
          const pages = doc.getPageCount();
          setFiles((prev) => prev.map((x) => (x.id === f.id ? { ...x, pages } : x)));
        } catch {
          setFiles((prev) => prev.map((x) => (x.id === f.id ? { ...x, pages: null, error: "This PDF looks damaged or password-protected." } : x)));
        }
      }
    },
    [limits.maxFileMB, limits.maxFiles],
  );

  const totalMB = files.reduce((s, f) => s + f.file.size, 0) / 1024 / 1024;
  const move = (i: number, d: -1 | 1) =>
    setFiles((prev) => {
      const j = i + d;
      if (j < 0 || j >= prev.length) return prev;
      const out = [...prev];
      [out[i], out[j]] = [out[j], out[i]];
      return out;
    });
  const remove = (id: string) =>
    setFiles((prev) => {
      const f = prev.find((x) => x.id === id);
      if (f?.url) URL.revokeObjectURL(f.url);
      return prev.filter((x) => x.id !== id);
    });
  const removeProblemFiles = () => {
    setFiles((prev) => {
      prev.forEach((f) => f.error && f.url && URL.revokeObjectURL(f.url));
      return prev.filter((f) => !f.error);
    });
    setFormError(null);
  };

  /* ---------------- pipeline ---------------- */

  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const startPolling = (id: string) => {
    if (poll.current) clearInterval(poll.current);
    poll.current = setInterval(async () => {
      try {
        const r = await api<{ material: MaterialDTO }>(`/api/materials/${id}`, { retries: 0 });
        setMaterial(r.material);
      } catch {
        /* transient; keep polling */
      }
    }, 1500);
  };
  const stopPolling = () => {
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
  };
  useEffect(() => stopPolling, []);

  const runPipeline = useCallback(async (m: MaterialDTO) => {
    setRunning(true);
    setPipelineError(null);
    startPolling(m.id);
    try {
      let cur = m;
      if (!cur.completedStages.includes("concepts")) {
        cur = (await api<{ material: MaterialDTO }>(`/api/materials/${m.id}/analyze`, { method: "POST", retries: 0 })).material;
        setMaterial(cur);
      }
      const r = await api<{ material: MaterialDTO; quest: { id: string; questionCount: number; playLength: number; rejectedCount: number } }>(
        `/api/materials/${m.id}/generate-quest`,
        { method: "POST", retries: 0 },
      );
      setMaterial(r.material);
      setQuest(r.quest);
    } catch (e) {
      setPipelineError(e instanceof ApiError ? e : new ApiError("UNKNOWN", "Processing failed. Please retry.", 0, true));
      try {
        setMaterial((await api<{ material: MaterialDTO }>(`/api/materials/${m.id}`)).material);
      } catch {
        /* ignore */
      }
    } finally {
      stopPolling();
      setRunning(false);
    }
  }, []);

  // Reopen an existing upload (e.g. from the dashboard).
  useEffect(() => {
    if (!resumeMaterialId) return;
    api<{ material: MaterialDTO }>(`/api/materials/${resumeMaterialId}`)
      .then(async (r) => {
        setMaterial(r.material);
        if (r.material.questId) {
          const q = await api<{ quest: { id: string; questionCount: number; playLength: number; rejectedCount: number } }>(`/api/quests/${r.material.questId}`);
          setQuest(q.quest);
        } else if (r.material.error) {
          setPipelineError(new ApiError(r.material.error.code, r.material.error.message, 0, r.material.error.retryable));
        }
      })
      .catch((e) => setFormError(e instanceof ApiError ? e.message : "Couldn't load that upload."));
  }, [resumeMaterialId]);

  async function upload() {
    if (files.length === 0) {
      setFormError("Add at least one photo or PDF of your notes.");
      return;
    }
    if (totalMB > limits.maxTotalMB) {
      setFormError(`Total upload is over ${limits.maxTotalMB} MB.`);
      return;
    }
    if (files.some((f) => f.error)) {
      setFormError("Remove the files marked with a problem first.");
      return;
    }
    setFormError(null);
    const fd = new FormData();
    fd.set("title", title || "My chapter");
    fd.set("subject", subject);
    fd.set("grade", grade);
    fd.set("goal", goal);
    fd.set("difficulty", difficulty);
    fd.set("questionCount", String(count));
    files.forEach((f) => fd.append("files", f.file, f.file.name));
    setUploadPct(0);
    try {
      const m = await new Promise<MaterialDTO>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/materials");
        xhr.upload.onprogress = (e) => e.lengthComputable && setUploadPct(Math.round((e.loaded / e.total) * 100));
        xhr.onload = () => {
          let body: { material?: MaterialDTO; error?: { code: string; message: string; retryable: boolean } } | null = null;
          try {
            body = JSON.parse(xhr.responseText);
          } catch {
            /* ignore */
          }
          if (xhr.status >= 200 && xhr.status < 300 && body?.material) resolve(body.material);
          else reject(new ApiError(body?.error?.code ?? "UPLOAD_FAILED", body?.error?.message ?? "Upload failed. Please try again.", xhr.status, true));
        };
        xhr.onerror = () => reject(new ApiError("NETWORK", "Upload failed: check your connection and try again.", 0, true));
        xhr.send(fd);
      });
      setMaterial(m);
      setUploadPct(null);
      router.replace(`/create?material=${m.id}`, { scroll: false });
      void runPipeline(m);
    } catch (e) {
      setUploadPct(null);
      setFormError(e instanceof ApiError ? e.message : "Upload failed.");
    }
  }

  async function deleteUpload() {
    if (!material) return;
    try {
      await api(`/api/materials/${material.id}`, { method: "DELETE", retries: 0 });
      setMaterial(null);
      setPipelineError(null);
      router.replace("/create");
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Couldn't delete the upload.");
    }
  }

  /* ---------------- render: processing / preview ---------------- */

  if (material) {
    const failedStage = material.error?.stage ?? (pipelineError ? material.stage : null);
    const stageState = (id: ProcessingStage): StageState => {
      if (material.completedStages.includes(id)) return "done";
      if (pipelineError || material.stage === "failed") return failedStage === id ? "failed" : "pending";
      if (material.stage === id) return "active";
      return "pending";
    };
    const ready = !!quest && material.stage === "ready";
    const errCode = pipelineError?.code ?? material.error?.code;
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <p className={cn("flex items-center gap-1.5 t-subhead font-semibold", ready ? "text-success" : "text-tint")}>
            {ready ? <Check className="size-4" strokeWidth={3} aria-hidden /> : null}
            {ready ? "Your quest is ready" : "Creating your quest"}
          </p>
          <h1 className="mt-0.5 t-large-title text-ink">{material.extracted?.chapterTitle || material.title}</h1>
          <p className="mt-1 t-subhead text-muted">
            {material.files.length} file{material.files.length === 1 ? "" : "s"} uploaded and stored privately
          </p>
        </header>

        {!ready && (
          <Card>
            <ol className="py-1" aria-live="polite" aria-label="Processing steps">
              {STAGES.map((s, idx) => {
                const st = stageState(s.id);
                return (
                  <li key={s.id} className="flex items-center gap-3.5 pl-4">
                    <StageIcon state={st} />
                    <div className={cn("min-w-0 flex-1 py-3 pr-4", idx < STAGES.length - 1 && "border-b border-line")}>
                      <p className={cn("t-subhead font-semibold", st === "pending" ? "text-muted" : "text-ink")}>{s.label}</p>
                      <p className={cn("t-footnote", st === "failed" ? "text-danger" : "text-muted")}>
                        {st === "done" ? "Done" : st === "active" ? s.detail : st === "failed" ? "Stopped here" : "Waiting"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        )}

        {(pipelineError || material.error) && !running && (
          <div role="alert" className="space-y-4 rounded-card bg-danger-fill/10 p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-danger-fill/16 text-danger" aria-hidden>
                <AlertTriangle className="size-4" />
              </span>
              <p className="pt-1 t-body text-ink">{pipelineError?.message ?? material.error?.message}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {errCode !== "AI_UNAVAILABLE" && (pipelineError?.retryable ?? material.error?.retryable) && (
                <Button onClick={() => runPipeline(material)}>
                  <RefreshCw /> Retry from where it stopped
                </Button>
              )}
              {errCode === "AI_UNAVAILABLE" && (
                <Button asChild>
                  <Link href={`/quest/${DEMO_QUEST_ID}`}>
                    <Gamepad2 /> Play the demo quest instead
                  </Link>
                </Button>
              )}
              {["UNREADABLE", "NOT_STUDY_MATERIAL", "TOO_FEW_VALID_QUESTIONS", "TOO_LARGE_FOR_AI"].includes(errCode ?? "") && (
                <Button variant="secondary" onClick={deleteUpload}>
                  <UploadCloud /> Upload clearer material
                </Button>
              )}
              <Button variant="danger" onClick={deleteUpload}>
                <Trash2 /> Delete this upload
              </Button>
            </div>
            <p className="t-footnote text-muted">Your upload is saved. Retrying resumes from the last completed step and never creates a duplicate quest.</p>
          </div>
        )}

        {formError && <ErrorTile message={formError} />}

        {material.extracted && <ChapterPreview content={material.extracted} />}

        {ready && quest && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-success-fill text-on-tint" aria-hidden>
                <Check className="size-5" strokeWidth={3} />
              </span>
              <div className="flex-1">
                <p className="t-headline text-ink">
                  <span className="font-rounded tabular">{quest.questionCount}</span> validated questions · <span className="font-rounded tabular">{quest.playLength}</span> per run
                </p>
                <p className="t-subhead text-muted">
                  Every answer key passed our checks
                  {quest.rejectedCount > 0 ? `; ${quest.rejectedCount} question${quest.rejectedCount === 1 ? " was" : "s were"} rejected and removed` : ""}.
                </p>
              </div>
              <Button asChild size="lg">
                <Link href={`/quest/${quest.id}`}>
                  <Play fill="currentColor" /> Begin quest
                </Link>
              </Button>
            </Card>
          </motion.div>
        )}
      </div>
    );
  }

  /* ---------------- render: upload form ---------------- */

  const overTotal = totalMB > limits.maxTotalMB;
  const problemFiles = files.filter((f) => f.error).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="t-large-title text-ink">Create a quest from your notes</h1>
        <p className="mt-1 t-subhead text-muted">Add photos of handwritten notes or a PDF of one chapter. The defaults work, so you only need to add files.</p>
      </header>

      {!aiAvailable && (
        <div className="flex flex-col gap-3 rounded-2xl bg-amber-fill/12 p-4 sm:flex-row sm:items-center">
          <AlertTriangle className="size-5 shrink-0 text-amber" aria-hidden />
          <p className="t-subhead text-ink">
            <span className="font-semibold">Demo mode:</span> this server has no Gemini credentials. Uploads are validated and stored, but analysis needs AI to be configured. The prepared demo quest works fully.
          </p>
          <Button asChild variant="amber" size="sm" className="shrink-0 self-start sm:ml-auto sm:self-center">
            <Link href={`/quest/${DEMO_QUEST_ID}`}>Play demo</Link>
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section className="min-w-0 space-y-3" aria-label="Your files">
          <motion.div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
            }}
            animate={{ scale: dragOver ? 1.01 : 1 }}
            transition={spring.snappy}
            className={cn(
              "flex flex-col items-center justify-center rounded-card border-2 border-dashed px-6 py-10 text-center transition-colors",
              dragOver ? "border-tint bg-tint/8" : "border-line-strong bg-surface",
            )}
          >
            <span className={cn("flex size-14 items-center justify-center rounded-full transition-colors", dragOver ? "bg-tint text-on-tint" : "bg-tint/14 text-tint")} aria-hidden>
              <UploadCloud className="size-7" />
            </span>
            <p className="mt-4 t-headline text-ink">{dragOver ? "Release to add" : "Drop your notes here"}</p>
            <p className="mt-1 t-footnote text-muted">
              PDF, JPG or PNG · up to {limits.maxFileMB} MB each, {limits.maxFiles} files, {limits.maxTotalMB} MB total
            </p>
            <Button variant="tinted" className="mt-5" onClick={() => inputRef.current?.click()}>
              Choose files
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              className="sr-only"
              aria-label="Choose files to upload"
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </motion.div>

          {files.length > 0 && (
            <>
              <Card className="overflow-hidden">
                <ul aria-label="Files to upload, in page order">
                  <AnimatePresence initial={false}>
                    {files.map((f, i) => (
                      <motion.li key={f.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="relative bg-surface">
                        <div
                          draggable
                          onDragStart={() => (dragIndex.current = i)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const from = dragIndex.current;
                            if (from === null || from === i) return;
                            setFiles((prev) => {
                              const out = [...prev];
                              const [it] = out.splice(from, 1);
                              out.splice(i, 0, it);
                              return out;
                            });
                            dragIndex.current = null;
                          }}
                          className={cn("flex cursor-grab items-center gap-3 py-2.5 pl-3 pr-1.5 active:cursor-grabbing", f.error && "bg-danger-fill/8")}
                        >
                          <span className="w-5 shrink-0 text-center font-rounded t-footnote font-semibold text-muted tabular">{i + 1}</span>
                          {f.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={f.url} alt="" className="size-12 shrink-0 rounded-xl bg-surface-2 object-cover" />
                          ) : (
                            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted" aria-hidden>
                              <FileText className="size-6" />
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate t-subhead font-semibold text-ink">{f.file.name}</p>
                            <p className={cn("flex items-center gap-1 t-footnote", f.error ? "text-danger" : "text-muted")}>
                              {f.error && <AlertTriangle className="size-3.5 shrink-0" aria-hidden />}
                              <span className="truncate">
                                {f.error ??
                                  `${f.kind === "pdf" ? (f.pages ? `PDF · ${f.pages} page${f.pages === 1 ? "" : "s"}` : "PDF") : "Image"} · ${(f.file.size / 1024 / 1024).toFixed(1)} MB`}
                              </span>
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center">
                            <Button variant="plain" size="icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${f.file.name} up`}>
                              <ArrowUp />
                            </Button>
                            <Button variant="plain" size="icon" onClick={() => move(i, 1)} disabled={i === files.length - 1} aria-label={`Move ${f.file.name} down`}>
                              <ArrowDown />
                            </Button>
                            <Button variant="plain" size="icon" className="hover:text-danger" onClick={() => remove(f.id)} aria-label={`Remove ${f.file.name}`}>
                              <Trash2 />
                            </Button>
                          </div>
                        </div>
                        {/* Inset hairline, aligned with the text column (iOS inset-grouped style) */}
                        {i < files.length - 1 && <span className="absolute bottom-0 left-[6.5rem] right-0 h-px bg-line" aria-hidden />}
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </Card>

              {/* Inline validation, updated as files are added */}
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 t-footnote" aria-live="polite">
                <span className="flex items-center gap-1 text-muted">
                  <ImageIcon className="size-3.5" aria-hidden /> Drag rows or use the arrows to set page order
                </span>
                <span className={cn("flex items-center gap-1 tabular", overTotal ? "font-semibold text-danger" : problemFiles ? "text-amber" : "text-muted")}>
                  {overTotal ? (
                    <AlertTriangle className="size-3.5" aria-hidden />
                  ) : problemFiles ? (
                    <AlertTriangle className="size-3.5" aria-hidden />
                  ) : (
                    <Check className="size-3.5 text-success" strokeWidth={3} aria-hidden />
                  )}
                  {files.length}/{limits.maxFiles} files · {totalMB.toFixed(1)} of {limits.maxTotalMB} MB
                  {overTotal ? " (over the limit)" : problemFiles ? ` · ${problemFiles} need${problemFiles === 1 ? "s" : ""} attention` : ""}
                </span>
              </div>
            </>
          )}
        </section>

        <section className="min-w-0 space-y-5" aria-label="Quest settings">
          <div>
            <h2 className="mb-1.5 px-4 t-eyebrow text-muted">Chapter</h2>
            <Card className="overflow-hidden">
              <FormRow label="Title" htmlFor="title">
                <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Collisions" maxLength={120} className={fieldCls} />
              </FormRow>
              <FormRow label="Subject" htmlFor="subject">
                <SelectField id="subject" value={subject} onChange={(v) => setSubject(v as Subject)}>
                  {SUBJECTS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </SelectField>
              </FormRow>
              <FormRow label="Class / grade" htmlFor="grade">
                <SelectField id="grade" value={grade} onChange={setGrade}>
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g === "Other" ? "Other" : `Grade ${g}`}
                    </option>
                  ))}
                </SelectField>
              </FormRow>
              <FormRow label="Exam goal" htmlFor="goal" last>
                <input
                  id="goal"
                  list="goals"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="e.g. School exam"
                  maxLength={200}
                  aria-label="Exam goal or learning objective"
                  className={fieldCls}
                />
                <datalist id="goals">
                  {GOALS.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </FormRow>
            </Card>
          </div>

          <div>
            <h2 className="mb-1.5 px-4 t-eyebrow text-muted">Questions</h2>
            <Card className="space-y-5 p-4">
              <fieldset>
                <legend className="mb-2 t-subhead text-ink">Difficulty</legend>
                <SegmentedControl
                  name="difficulty"
                  value={difficulty}
                  onChange={setDifficulty}
                  options={(["easy", "medium", "hard", "mixed"] as const).map((d) => ({ value: d, label: d[0].toUpperCase() + d.slice(1) }))}
                />
              </fieldset>
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <label htmlFor="count" className="t-subhead text-ink">
                    Questions per run
                  </label>
                  <span className="font-rounded t-headline text-ink tabular" aria-hidden>
                    {count}
                  </span>
                </div>
                <input
                  id="count"
                  type="range"
                  min={4}
                  max={15}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="w-full cursor-pointer accent-[var(--tint)]"
                />
                <div className="flex justify-between t-caption text-muted tabular" aria-hidden>
                  <span>4</span>
                  <span>15</span>
                </div>
              </div>
            </Card>
          </div>

          <AnimatePresence initial={false}>
            {formError && (
              <motion.div key="form-error" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
                <ErrorTile message={formError}>
                  {problemFiles > 0 && (
                    <Button variant="danger" size="sm" onClick={removeProblemFiles}>
                      <Trash2 /> Remove files with problems
                    </Button>
                  )}
                </ErrorTile>
              </motion.div>
            )}
          </AnimatePresence>

          {uploadPct !== null ? (
            <div className="space-y-2 rounded-2xl bg-surface px-4 py-3.5" aria-live="polite">
              <p className="flex items-center gap-2 t-subhead text-ink">
                <Loader2 className="size-4 animate-spin text-tint" aria-hidden /> Uploading… <span className="ml-auto font-rounded font-semibold tabular">{uploadPct}%</span>
              </p>
              <Progress value={uploadPct} label="Upload progress" />
            </div>
          ) : (
            <Button size="lg" className="w-full" onClick={upload} disabled={files.length === 0}>
              <BookOpen /> Create my quest
            </Button>
          )}
          <p className="px-1 t-footnote text-muted">Files are stored privately and only used to build your quest. You can delete them any time from the dashboard.</p>
        </section>
      </div>
    </div>
  );
}

/* ---------------- pieces ---------------- */

type StageState = "done" | "active" | "failed" | "pending";

/** iOS-style checklist glyph: filled green check, tint spinner, red cross, or an empty gray ring. */
function StageIcon({ state }: { state: StageState }) {
  return (
    <span className="relative flex size-7 shrink-0 items-center justify-center" aria-hidden>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={state}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={spring.snappy}
          className={cn(
            "flex size-7 items-center justify-center rounded-full",
            state === "done" && "bg-success-fill text-on-tint",
            state === "active" && "text-tint",
            state === "failed" && "bg-danger-fill text-on-tint",
            state === "pending" && "border-2 border-line-strong",
          )}
        >
          {state === "done" ? (
            <Check className="size-4" strokeWidth={3} />
          ) : state === "active" ? (
            <Loader2 className="size-6 animate-spin" strokeWidth={2.5} />
          ) : state === "failed" ? (
            <X className="size-4" strokeWidth={3} />
          ) : null}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function ErrorTile({ message, children }: { message: string; children?: React.ReactNode }) {
  return (
    <div role="alert" className="space-y-3 rounded-2xl bg-danger-fill/10 p-3.5">
      <p className="flex items-start gap-2 t-subhead text-ink">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden /> {message}
      </p>
      {children && <div className="flex flex-wrap gap-2 pl-6">{children}</div>}
    </div>
  );
}

/** iOS segmented control: gray track, raised selected segment that slides between options. */
function SegmentedControl<T extends string>({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="grid rounded-[0.5625rem] bg-fill-3 p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <label
            key={o.value}
            className={cn(
              "relative cursor-pointer select-none rounded-[0.4375rem] py-1.5 text-center t-footnote font-semibold transition-colors has-[input:focus-visible]:outline-[3px] has-[input:focus-visible]:outline-offset-1 has-[input:focus-visible]:outline-tint/70 has-[input:focus-visible]:outline-solid",
              selected ? "text-ink" : "text-muted hover:text-ink",
            )}
          >
            {selected && (
              <motion.span
                layoutId={`${name}-segment`}
                className="absolute inset-0 rounded-[0.4375rem] bg-surface shadow-[0_3px_8px_rgb(0_0_0/0.12),0_3px_1px_rgb(0_0_0/0.04)] dark:bg-surface-3"
                aria-hidden
              />
            )}
            <input type="radio" name={name} value={o.value} checked={selected} onChange={() => onChange(o.value)} className="sr-only" />
            <span className="relative">{o.label}</span>
          </label>
        );
      })}
    </div>
  );
}

const fieldCls = "h-11 w-full min-w-0 rounded-md bg-transparent text-right t-subhead text-ink placeholder:text-faint";

/** Grouped-form row: label on the leading edge, control on the trailing edge, inset hairline below. */
function FormRow({ label, htmlFor, last, children }: { label: string; htmlFor: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div className="relative flex items-center gap-3 px-4 focus-within:bg-fill-4">
      <label htmlFor={htmlFor} className="shrink-0 t-subhead text-ink">
        {label}
      </label>
      <div className="flex min-w-0 flex-1 items-center justify-end">{children}</div>
      {!last && <span className="absolute bottom-0 left-4 right-0 h-px bg-line" aria-hidden />}
    </div>
  );
}

function SelectField({ id, value, onChange, children }: { id: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="relative flex min-w-0 items-center">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 min-w-0 cursor-pointer appearance-none rounded-md bg-transparent pr-5 text-right t-subhead text-muted"
      >
        {children}
      </select>
      <ChevronsUpDown className="pointer-events-none absolute right-0 size-3.5 text-muted" aria-hidden />
    </div>
  );
}

function ChapterPreview({ content }: { content: ExtractedContent }) {
  return (
    <Card role="region" className="space-y-6 p-5" aria-label="Chapter preview">
      <section>
        <h2 className="mb-1.5 t-eyebrow text-muted">Detected in your material</h2>
        <p className="t-body text-ink">{content.summary}</p>
      </section>
      <section>
        <h3 className="mb-2 t-headline text-ink">
          Concepts <span className="font-rounded text-muted tabular">{content.concepts.length}</span>
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {content.concepts.map((c) => (
            <div key={c.key} className="min-w-0 rounded-2xl bg-surface-2 p-3.5">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 t-subhead font-semibold text-ink">{c.title}</p>
                <Badge tone={c.fromNotes ? "success" : "neutral"} className="shrink-0" title={c.fromNotes ? "Found in your notes" : "Added from standard subject knowledge"}>
                  {c.fromNotes ? "in your notes" : "added"}
                </Badge>
              </div>
              <p className="mt-1 t-footnote text-muted">{c.description}</p>
              {c.sourceRefs.length > 0 && <p className="mt-1 t-caption text-faint">{c.sourceRefs.map((s) => s.ref).join(", ")}</p>}
            </div>
          ))}
        </div>
      </section>
      {content.formulas.length > 0 && (
        <section>
          <h3 className="mb-2 t-headline text-ink">Formulas</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {content.formulas.slice(0, 6).map((f, i) => (
              <div key={i} className="min-w-0 rounded-2xl bg-surface-2 px-4 py-3">
                <Tex tex={f.latex} display className="block text-ink" />
                <p className="t-footnote text-muted">{f.meaning}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      {content.uncertain.length > 0 && (
        <section className="rounded-2xl bg-amber-fill/12 p-4">
          <p className="mb-1 flex items-center gap-1.5 t-subhead font-semibold text-amber">
            <AlertTriangle className="size-4" aria-hidden /> We couldn&apos;t read everything
          </p>
          <ul className="list-disc space-y-0.5 pl-5 t-subhead text-ink">
            {content.uncertain.map((u, i) => (
              <li key={i}>
                <span className="text-muted">{u.ref}:</span> {u.issue}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 t-footnote text-muted">Questions were only built from the parts we could read.</p>
        </section>
      )}
    </Card>
  );
}
