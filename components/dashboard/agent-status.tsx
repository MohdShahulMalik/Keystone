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
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-ice">
          {session.title ?? "Untitled research"}
        </p>
        <span
          className={`shrink-0 flex-none font-mono text-xs ${
            session.status === "failed"
              ? "text-danger"
              : session.status === "completed"
                ? "text-ok"
                : "text-acc-cyan"
          }`}
        >
          {session.status}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 rounded-full bg-ink"
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
      <p className="mt-1.5 font-mono text-[10px] text-body/60">
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
    <Tile
      label="Agent status"
      className="min-w-0 overflow-hidden p-6 sm:col-span-2 lg:col-span-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <p className="mt-5 text-sm leading-relaxed text-body">
          No research sessions yet.{" "}
          <Link
            href="/research/job"
            className="text-acc-cyan underline-offset-4 hover:underline focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-acc-cyan focus-visible:outline-offset-2"
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

          <div className="rounded-xl border border-edge bg-ink/60 p-3">
            <p className="font-mono text-[11px] text-body/70">
              {tracked} tracked · {sessions.length} recent session
              {sessions.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      )}
    </Tile>
  );
}
