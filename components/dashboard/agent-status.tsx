import Link from "next/link";
import {
  type DashboardSession,
  relativeTime,
  sessionProgress,
} from "@/lib/dashboard/metrics";
import { Eyebrow, Pill, Tile } from "./tile";

function SessionRow({ session }: { session: DashboardSession }) {
  const { percent, bar } = sessionProgress(session.status);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate text-sm text-foreground-900">
          {session.title ?? "Untitled research"}
        </p>
        <span
          className={`shrink-0 font-mono text-xs ${
            session.status === "failed"
              ? "text-danger"
              : session.status === "completed"
                ? "text-success"
                : "text-accent"
          }`}
        >
          {session.status}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 rounded-full bg-surface-900"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${session.title ?? "Research"} progress`}
      >
        <div
          className={`h-full rounded-full ${bar}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1.5 font-mono text-[10px] text-foreground-600/60">
        {session.resultCount} matched · {session.subagents} subagent
        {session.subagents === 1 ? "" : "s"} ·{" "}
        {relativeTime(new Date(session.createdAt))}
      </p>
    </div>
  );
}

export function AgentStatusCard({
  sessions,
  tracked,
}: {
  sessions: DashboardSession[];
  tracked: number;
}) {
  const running = sessions.filter((s) => s.status === "running").length;

  return (
    <Tile label="Agent status" className="p-6 lg:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>Agents</Eyebrow>
        {running > 0 ? (
          <Pill tone="success" live>
            live
          </Pill>
        ) : (
          <Pill>idle</Pill>
        )}
      </div>

      {sessions.length === 0 ? (
        <p className="mt-5 text-sm leading-relaxed">
          No research sessions yet.{" "}
          <Link
            href="/research/job"
            className="text-accent underline-offset-4 hover:underline"
          >
            Start one
          </Link>{" "}
          and its progress will show up here.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {sessions.slice(0, 2).map((session) => (
            <SessionRow key={session.id} session={session} />
          ))}

          <div className="rounded-xl border border-stroke bg-surface-900/60 p-3">
            <p className="font-mono text-[11px] text-foreground-600/70">
              {tracked} tracked · {sessions.length} recent session
              {sessions.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      )}
    </Tile>
  );
}
