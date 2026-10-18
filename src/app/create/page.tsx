import type { Metadata } from "next";
import { CreateFlow } from "@/components/create/create-flow";
import { AppShell } from "@/components/layout/app-shell";
import { config, publicStatus } from "@/lib/config";

export const metadata: Metadata = { title: "Create a quest · QuestLearn AI" };

export default async function CreatePage(props: PageProps<"/create">) {
  const sp = await props.searchParams;
  const materialId = typeof sp.material === "string" ? sp.material : null;
  return (
    <AppShell>
      <CreateFlow
        aiAvailable={publicStatus().aiAvailable}
        resumeMaterialId={materialId}
        limits={{ maxFileMB: config.limits.maxFileBytes / 1024 / 1024, maxTotalMB: config.limits.maxTotalBytes / 1024 / 1024, maxFiles: config.limits.maxFiles }}
      />
    </AppShell>
  );
}
