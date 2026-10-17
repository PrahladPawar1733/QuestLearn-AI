import type { Metadata } from "next";
import { CreateFlow } from "@/components/create/create-flow";
import { AppShell } from "@/components/layout/app-shell";
import { config, publicStatus } from "@/lib/config";
import { SUBJECTS } from "@/lib/types";

export const metadata: Metadata = { title: "Create a quest · QuestLearn AI" };

export default async function CreatePage(props: PageProps<"/create">) {
  const sp = await props.searchParams;
  const subject = typeof sp.subject === "string" && (SUBJECTS as readonly string[]).includes(sp.subject) ? sp.subject : "Physics";
  const materialId = typeof sp.material === "string" ? sp.material : null;
  return (
    <AppShell>
      <CreateFlow
        aiAvailable={publicStatus().aiAvailable}
        initialSubject={subject as (typeof SUBJECTS)[number]}
        resumeMaterialId={materialId}
        limits={{ maxFileMB: config.limits.maxFileBytes / 1024 / 1024, maxTotalMB: config.limits.maxTotalBytes / 1024 / 1024, maxFiles: config.limits.maxFiles }}
      />
    </AppShell>
  );
}
