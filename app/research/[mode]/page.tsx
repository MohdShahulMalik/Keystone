import { notFound } from "next/navigation";
import { getSearchSessions } from "@/app/actions/search";
import { ResearchClient } from "@/app/research/component/ResearchClient";
import { ResearchSessionSidebar } from "@/components/ResearchSessionSidebar";

const modeLabels: Record<string, string> = {
  job: "Job research",
  dsa: "DSA research",
};

export default async function ResearchPage({
  params,
}: PageProps<"/research/[mode]">) {
  const { mode } = await params;
  if (mode !== "job" && mode !== "dsa") notFound();

  const userId = "maxum";
  const sessions = await getSearchSessions(userId, mode);

  return (
    <div className="min-h-screen bg-surface-900 text-foreground-900 lg:flex">
      <ResearchSessionSidebar
        sessions={sessions}
        activeSessionId={undefined}
        title={modeLabels[mode]}
        mode={mode}
      />
      <main className="min-w-0 flex-1 px-4 py-16 sm:px-6 lg:px-12 lg:py-12">
        <ResearchClient mode={mode} label={modeLabels[mode]} />
      </main>
    </div>
  );
}
