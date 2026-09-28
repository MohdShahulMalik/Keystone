import { notFound, useRouter } from "next/navigation";
import { ResearchClient } from "@/app/research/component/ResearchClient";
import {
  type ResearchSession,
  ResearchSessionSidebar,
} from "@/components/ResearchSessionSidebar";
import { getSearchSessions } from "@/app/actions/search";

const sessions: ResearchSession[] = [
  {
    id: "react-roles",
    title: "Senior React roles",
    detail: "Remote · USA and UK",
    updatedAt: "2m",
  },
  {
    id: "backend-roles",
    title: "Backend jobs in Germany",
    detail: "Hybrid · Python",
    updatedAt: "1h",
  },
  {
    id: "fullstack-roles",
    title: "Full-stack Node positions",
    detail: "Remote · Global",
    updatedAt: "Yesterday",
  },
];

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
  const router = useRouter();

  const onNewSession = () => {
    router.push(`/research/${mode}`);
  }

  const onSelectSession = (sessionId: string) => {
    router.push(`/research/${mode}?sessionId=${sessionId}`);
  }

  return (
    <div className="min-h-screen bg-surface-900 text-foreground-900 lg:flex">
      <ResearchSessionSidebar
        sessions={sessions}
        activeSessionId="react-roles"
        title={modeLabels[mode]}
        onNewSession={onNewSession}
        onSelectSession={onSelectSession}
      />
      <main className="min-w-0 flex-1 px-4 py-16 sm:px-6 lg:px-12 lg:py-12">
        <ResearchClient mode={mode} label={modeLabels[mode]} />
      </main>
    </div>
  );
}
