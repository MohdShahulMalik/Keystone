import { notFound } from "next/navigation";
import { getSearchSessionsWithMetaData } from "@/app/actions/search";
import { ResearchSessionSidebar } from "@/components/ResearchSessionSidebar";
import { ResearchClient } from "../component/ResearchClient";

const modeLabels: Record<string, string> = {
  job: "Job research",
  dsa: "DSA research",
};

export default async function ResearchPage({
  params,
  searchParams,
}: PageProps<"/research/[mode]">) {
  const { mode } = await params;
  if (mode !== "job" && mode !== "dsa") notFound();

  const sessions = await getSearchSessionsWithMetaData(mode);
  const { sessionId } = await searchParams;
  const activeSessionId: string | undefined =
    typeof sessionId === "string" ? sessionId : undefined;

  return (
    <div className="min-h-screen bg-surface-900 text-foreground-900 lg:flex">
      <ResearchSessionSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        title={modeLabels[mode]}
        mode={mode}
      />
      <main className="min-w-0 flex-1 px-4 pt-20 pb-10 sm:px-6 lg:px-12 lg:py-12">
        <ResearchClient mode={mode} label={modeLabels[mode]} />
      </main>
    </div>
  );
}
