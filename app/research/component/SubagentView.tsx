"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { SubagentHistory } from "@/app/actions/search";
import { getSubagentHistory } from "@/app/actions/search";
import { AgentResponse } from "@/components/AgentResponse";
import type {
  ResearchStatus,
  SequencedSegment,
  SubagentLive,
  TextSegment,
} from "@/lib/types/research";

type SubagentViewProps = {
  // opencode child session id (SubagentSession.sessionId)
  childSessionId: string;
  mode: "job" | "dsa";
  // live state harvested from the parent stream by useResearchStream
  live?: SubagentLive;
};

function statusToResearchStatus(
  db: SubagentHistory["subagent"]["status"] | undefined,
  live: SubagentLive | undefined,
): ResearchStatus {
  if (live?.status === "running") return "running";
  if (db === "failed") return "error";
  if (db === "completed") return "completed";
  return "completed";
}

export function SubagentView({
  childSessionId,
  mode,
  live,
}: SubagentViewProps) {
  const [history, setHistory] = useState<SubagentHistory | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "found" | "not-found">(
    "loading",
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setHistory(null);
    setLoadError(null);

    (async () => {
      try {
        const h = await getSubagentHistory(childSessionId);
        if (cancelled) return;
        if (!h) {
          setLoadState("not-found");
          return;
        }
        setHistory(h);
        setLoadState("found");
      } catch (err) {
        if (cancelled) return;
        setLoadState("not-found");
        setLoadError(
          err instanceof Error ? err.message : "Failed to load subagent",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [childSessionId]);

  // Persisted SubagentSegments are the source of truth; live segments only
  // fill seqs the database has not committed yet (the parent stream emits
  // each child delta before the matching persist lands).
  const segments = useMemo<TextSegment[]>(() => {
    if (!history) return [];
    const bySeq = new Map<number, TextSegment>();
    for (const seg of history.segments) {
      bySeq.set(seg.seq, {
        id: `db-${seg.seq}`,
        text: seg.text,
        kind: seg.kind as TextSegment["kind"],
      });
    }
    for (const seg of live?.segments ?? []) {
      if (bySeq.has(seg.seq)) continue;
      bySeq.set(seg.seq, toTextSegment(seg));
    }
    return [...bySeq.entries()].sort(([a], [b]) => a - b).map(([, seg]) => seg);
  }, [history, live?.segments]);

  if (loadState === "loading") {
    return (
      <div className="mx-auto max-w-3xl animate-pulse rounded-2xl border border-stroke bg-surface-800 p-7 text-sm text-foreground-600-subtle">
        Loading subagent…
      </div>
    );
  }

  if (loadState === "not-found") {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/15 px-4 py-2 text-sm text-amber-400">
          Subagent not found.
          {loadError ? ` ${loadError}` : ""}
        </p>
        <Link
          href={`/research/${mode}`}
          className="inline-block text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          Back to research
        </Link>
      </div>
    );
  }

  if (!history) return null;

  const { subagent, parent, siblings } = history;
  const status = statusToResearchStatus(subagent.status, live);
  const parentHref = parent
    ? `/research/${parent.mode}?sessionId=${parent.id}`
    : `/research/${mode}`;
  const type = subagent.subagentType ?? "general";

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-3">
        <Link
          href={parentHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground-600 transition-colors hover:text-foreground-900"
        >
          <span aria-hidden="true">←</span>
          {parent?.title ?? "Back to research"}
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
              status === "completed"
                ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                : status === "error"
                  ? "border-rose-500/30 bg-rose-500/15 text-rose-400"
                  : "border-sky-500/30 bg-sky-500/15 text-sky-400"
            }`}
          >
            {status}
          </span>
          <span className="rounded-full border border-stroke bg-surface-800 px-3 py-1 text-xs font-medium text-foreground-600">
            {type}
          </span>
        </div>

        <h1 className="text-xl font-semibold text-foreground-900">
          {subagent.title || subagent.description || "Subagent"}
        </h1>
        {subagent.description && subagent.description !== subagent.title ? (
          <p className="text-sm leading-relaxed text-foreground-600">
            {subagent.description}
          </p>
        ) : null}

        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-foreground-600-subtle">
          {subagent.toolCount !== null ? (
            <div>
              <dt className="inline font-medium text-foreground-600">
                Tools:{" "}
              </dt>
              <dd className="inline">{subagent.toolCount}</dd>
            </div>
          ) : null}
          {subagent.timeTaken ? (
            <div>
              <dt className="inline font-medium text-foreground-600">
                Duration:{" "}
              </dt>
              <dd className="inline">{subagent.timeTaken}</dd>
            </div>
          ) : null}
          <div>
            <dt className="inline font-medium text-foreground-600">
              Session:{" "}
            </dt>
            <dd className="inline font-mono">{subagent.sessionId}</dd>
          </div>
        </dl>

        {subagent.error ? (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/15 px-4 py-2 text-sm text-rose-400">
            {subagent.error}
          </p>
        ) : null}
      </div>

      <AgentResponse segments={segments} status={status} error={null} />

      {siblings.length > 1 ? (
        <section className="space-y-3" aria-label="Other subagents">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-foreground-600-subtle">
            Other subagents in this research
          </h2>
          <ul className="space-y-2">
            {siblings
              .filter((sib) => sib.sessionId !== subagent.sessionId)
              .map((sib) => (
                <li key={sib.id}>
                  <Link
                    href={`/research/${parent?.mode ?? mode}?sessionId=${subagent.parentId}&subagentId=${sib.sessionId}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-stroke bg-surface-800 px-4 py-3 text-sm transition-colors hover:border-accent hover:bg-surface-700"
                  >
                    <span className="truncate text-foreground-900">
                      {sib.title || sib.sessionId}
                    </span>
                    <span className="shrink-0 text-xs text-foreground-600-subtle">
                      {sib.subagentType ?? "general"}
                      {sib.timeTaken ? ` · ${sib.timeTaken}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function toTextSegment(seg: SequencedSegment): TextSegment {
  return { id: seg.id, text: seg.text, kind: seg.kind };
}
