"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { startResearch } from "@/app/actions/research";
import {
  getSearchSessionByAnyId,
  getSearchSessionHistory,
  getSubagentHistory,
} from "@/app/actions/search";
import type { SearchSession } from "@/app/generated/prisma";
import { AgentResponse } from "@/components/AgentResponse";
import { JobListingCard } from "@/components/cards/listings";
import { useResearchStream } from "@/hooks/useResearchStream";
import { deriveSessionTitle } from "@/lib/opencode/prompts";
import type { JobPayload } from "@/lib/research/job-schema";
import type { JobListing } from "@/lib/types/jobs";
import { GLM_5_3_FLASH_FREE_REF } from "@/lib/types/opencode";
import type { TextSegment } from "@/lib/types/research";
import type { JobStatus } from "@/lib/types/status";
import { ResearchForm, type UserPreferences } from "./ResearchForm";
import { SubagentView } from "./SubagentView";

type ResearchClientProps = {
  mode: "job" | "dsa";
  label: string;
};

const statuses: JobStatus[] = [
  "OPEN",
  "APPLIED",
  "INTERVIEW",
  "OFFER",
  "REJECTED",
  "DECLINED",
];

function toJobListing(job: JobPayload): JobListing {
  return {
    id: job.id,
    userId: "local",
    title: job.title,
    company: job.company,
    location: job.location,
    url: job.url ?? null,
    description: job.description,
    salary: job.salary ?? null,
    experience: job.experience,
    visa: job.visa ?? null,
    type: job.type,
    country: job.country ?? null,
    status: "OPEN",
    notes: job.notes ?? null,
    appliedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function toList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toDisplayString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value.filter((v) => typeof v === "string").join(", ");
  return "";
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string");
  if (typeof value === "string") return toList(value);
  return [];
}

/** Rebuild the prefs header from the DB row after reload (memory-only otherwise). */
function prefsFromDb(preferences: unknown): UserPreferences | null {
  if (!preferences || typeof preferences !== "object") return null;
  const p = preferences as Record<string, unknown>;
  const jobTypes = toStringArray(p.jobTypes);
  const countries = toDisplayString(p.countries);
  const skills = toDisplayString(p.skills);
  if (jobTypes.length === 0 && !countries && !skills) return null;
  const rawModel = p.model as
    | { providerID?: unknown; id?: unknown; variant?: unknown }
    | undefined;
  const model =
    rawModel &&
    typeof rawModel.providerID === "string" &&
    typeof rawModel.id === "string"
      ? {
          providerID: rawModel.providerID,
          id: rawModel.id,
          ...(typeof rawModel.variant === "string"
            ? { variant: rawModel.variant }
            : {}),
        }
      : GLM_5_3_FLASH_FREE_REF;
  const modelLabel =
    typeof p.modelLabel === "string" && p.modelLabel
      ? p.modelLabel
      : rawModel && typeof rawModel.id === "string"
        ? `${String(rawModel.providerID ?? "unknown")}/${String(rawModel.id)}`
        : "Unknown model";
  return {
    model,
    modelLabel,
    jobTypes: jobTypes.length > 0 ? jobTypes : ["Any"],
    countries,
    skills,
    notes: typeof p.notes === "string" ? p.notes : "",
    ...(typeof p.resumeName === "string" ? { resumeName: p.resumeName } : {}),
    ...(typeof p.resumeId === "string" ? { resumeId: p.resumeId } : {}),
  };
}

export function ResearchClient({ mode, label }: ResearchClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Session is driven by the URL: the agent response view only renders when
  // the path contains a `sessionId` query param. Accepts DB id (sidebar)
  // or legacy openCodeSessionId (old form links) — resolved via
  // getSearchSessionByAnyId.
  const urlSessionId = searchParams.get("sessionId");
  // Subagent drill-down is URL-backed (?subagentId=) so a reload restores the
  // same child transcript instead of dropping back to the parent view.
  const urlSubagentId = searchParams.get("subagentId");
  const [check, setCheck] = useState<
    "idle" | "checking" | "found" | "not-found"
  >(urlSessionId ? "checking" : "idle");
  const [session, setSession] = useState<SearchSession | null>(null);
  const [legacySubagentId, setLegacySubagentId] = useState<string | null>(null);
  // The SSE connection waits for getSearchSessionHistory to settle. Without
  // this gate the stream could start appending live segments and then a
  // late history load would reset state and wipe them.
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historySegments, setHistorySegments] = useState<TextSegment[]>([]);
  const [historyJobs, setHistoryJobs] = useState<JobPayload[]>([]);
  const [userPreferences, setUserPreferences] =
    useState<UserPreferences | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);

  useEffect(() => {
    let cancelled = false;

    if (!urlSessionId) {
      setCheck("idle");
      setSession(null);
      setLegacySubagentId(null);
      setHistoryLoaded(false);
      setHistorySegments([]);
      setHistoryJobs([]);
      setUserPreferences(null);
      return;
    }

    setCheck("checking");
    setHistoryLoaded(false);
    (async () => {
      try {
        const s = await getSearchSessionByAnyId(urlSessionId);
        if (cancelled) return;
        if (!s) {
          // Older subagent links pointed ?sessionId= at the child id, which
          // only resolves in SubagentSession - fall back before giving up.
          const subagent = await getSubagentHistory(urlSessionId);
          if (cancelled) return;
          if (subagent) {
            setLegacySubagentId(subagent.subagent.sessionId);
            setSession(null);
            setHistoryLoaded(true);
            setCheck("not-found");
            return;
          }
          setCheck("not-found");
          setSession(null);
          setHistoryLoaded(true);
          setHistorySegments([]);
          setHistoryJobs([]);
          return;
        }

        setSession(s);
        setLegacySubagentId(null);
        const dbPrefs = prefsFromDb(
          (s as { preferences?: unknown }).preferences ?? null,
        );
        if (dbPrefs) setUserPreferences(dbPrefs);
        const h = await getSearchSessionHistory(s.id);
        if (cancelled) return;
        // Null means the session vanished mid-load (or is not ours anymore)
        // — render it like an empty history rather than crash.
        const history = h ?? { segments: [], results: [] };
        setHistorySegments(
          history.segments.map((r) => ({
            id: `db-${r.seq}`,
            text: r.text,
            kind: r.kind as TextSegment["kind"],
          })),
        );

        setHistoryJobs(
          history.results.map((r, i) => {
            const j = r.jobListingJson as unknown as JobPayload;
            return {
              ...j,
              id: String(j.id ?? `${s.id}-db-${i}`),
              sessionId: String(j.sessionId ?? s.openCodeSessionId),
              seq: Number(j.seq ?? i),
            };
          }),
        );
        // History settled: the live stream may now attach.
        setHistoryLoaded(true);
        setCheck("found");
      } catch (err) {
        if (!cancelled) {
          setCheck("not-found");
          setHistoryLoaded(true);
          setStartError(
            err instanceof Error ? err.message : "Failed to load session",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [urlSessionId]);

  const isRunningDb = check === "found" && session?.status === "running";
  // Gate the live stream on the history load (see historyLoaded above).
  const streamId =
    isRunningDb && session && historyLoaded ? session.openCodeSessionId : null;
  const live = useResearchStream(
    streamId,
    {
      segments: historySegments,
      jobs: historyJobs,
    },
    { mode },
  );

  const selectSubagent = (childSessionId: string) => {
    const params = new URLSearchParams();
    if (session) params.set("sessionId", session.id);
    else if (urlSessionId) params.set("sessionId", urlSessionId);
    params.set("subagentId", childSessionId);
    router.replace(`/research/${mode}?${params.toString()}`);
  };

  const activeSubagentId = urlSubagentId ?? legacySubagentId;

  // Hook seeds DB history, then appends live tail. Completed/failed:
  // streamId is null so live holds DB only. Running: live holds
  // DB seed + new SSE events (job dedupe happens inside the hook).
  const liveStatus = live.status;
  const status = isRunningDb
    ? liveStatus === "idle"
      ? "connecting"
      : liveStatus
    : check === "found"
      ? session?.status === "failed"
        ? "error"
        : "completed"
      : liveStatus;
  const segments = live.segments;
  const jobs = live.jobs;
  const listings: JobListing[] = jobs.map(toJobListing);
  const visibleListings = listings.slice(0, visibleCount);
  const hasMore = listings.length > visibleCount;
  const isStreaming = status === "running" || status === "connecting";

  const startResearchHandler = async (preferences: UserPreferences) => {
    setUserPreferences(preferences);
    setStartError(null);
    live.reset();
    setHistorySegments([]);
    setHistoryJobs([]);
    setVisibleCount(20);

    try {
      const skills = toList(preferences.skills);
      const countries = toList(preferences.countries);

      const { sessionId: newDbSessionId } = await startResearch({
        jobTypes:
          preferences.jobTypes.length > 0 ? preferences.jobTypes : ["Any"],
        countries: countries.length > 0 ? countries : ["Current"],
        skills: skills.length > 0 ? skills : ["General"],
        notes: preferences.notes || undefined,
        model: preferences.model,
        modelLabel: preferences.modelLabel || undefined,
        resumeName: preferences.resumeName || undefined,
        resumeId: preferences.resumeId || undefined,
        mode,
      });
      router.replace(`?sessionId=${newDbSessionId}`);
    } catch (err) {
      setStartError(
        err instanceof Error ? err.message : "Failed to start research",
      );
    }
  };

  const started = urlSessionId !== null;
  const displayError = startError ?? live.error;
  const sessionTitle =
    session?.title ??
    (session
      ? deriveSessionTitle(
          (session as { preferences?: unknown }).preferences ?? null,
          session.query,
        )
      : label);

  if (activeSubagentId) {
    return (
      <SubagentView
        childSessionId={activeSubagentId}
        mode={mode}
        live={live.subagents[activeSubagentId]}
      />
    );
  }

  if (!started || check === "idle" || check === "not-found") {
    return (
      <div className="mx-auto max-w-3xl">
        <section
          className="rounded-2xl border border-stroke bg-surface-700 p-5 shadow-lg sm:p-7"
          aria-label={`${label} configuration`}
        >
          {check === "not-found" ? (
            <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/15 px-4 py-2 text-sm text-amber-400">
              Session not found. Start a new research below.
            </p>
          ) : null}
          {startError ? (
            <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/15 px-4 py-2 text-sm text-rose-400">
              {startError}
            </p>
          ) : null}
          <ResearchForm researchType={mode} onStart={startResearchHandler} />
        </section>
      </div>
    );
  }

  if (check === "checking") {
    return (
      <div className="mx-auto max-w-3xl animate-pulse rounded-2xl border border-stroke bg-surface-800 p-5 text-sm text-foreground-600-subtle sm:p-7">
        Loading session…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="space-y-8">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-foreground-900">
            {sessionTitle}
          </h2>
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
        </div>

        <div className="space-y-6">
          {userPreferences ? (
            <div className="flex justify-start sm:justify-end">
              <div className="w-full min-w-0 max-w-md break-words rounded-2xl border border-stroke bg-surface-800 p-4 text-sm">
                <div className="space-y-2 text-foreground-600">
                  <div>
                    <span className="font-medium text-foreground-900">
                      Model:
                    </span>{" "}
                    {userPreferences.modelLabel ??
                      `${userPreferences.model.providerID}/${userPreferences.model.id}${userPreferences.model.variant ? `:${userPreferences.model.variant}` : ""}`}
                  </div>
                  <div>
                    <span className="font-medium text-foreground-900">
                      Job Types:
                    </span>{" "}
                    {userPreferences.jobTypes.join(", ")}
                  </div>
                  <div>
                    <span className="font-medium text-foreground-900">
                      Countries:
                    </span>{" "}
                    {userPreferences.countries || "Any"}
                  </div>
                  <div>
                    <span className="font-medium text-foreground-900">
                      Skills:
                    </span>{" "}
                    {userPreferences.skills || "None specified"}
                  </div>
                  {userPreferences.resumeName ? (
                    <div>
                      <span className="font-medium text-foreground-900">
                        Resume:
                      </span>{" "}
                      {userPreferences.resumeName}
                    </div>
                  ) : null}
                  {userPreferences.notes ? (
                    <div>
                      <span className="font-medium text-foreground-900">
                        Notes:
                      </span>{" "}
                      {userPreferences.notes}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <AgentResponse
            segments={segments}
            status={status}
            error={displayError}
            onSelectSubagent={selectSubagent}
          />
        </div>

        {mode === "job" && jobs.length > 0 ? (
          <section className="mt-12 space-y-4" aria-label="Job matches">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="min-w-0 text-lg font-semibold break-words text-foreground-900">
                Matched jobs{" "}
                <span className="ml-2 rounded-full bg-surface-800 px-2.5 py-1 text-xs font-medium text-foreground-600">
                  {jobs.length}
                  {isStreaming ? " · streaming…" : ""}
                </span>
              </h3>
              {jobs.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setVisibleCount(listings.length)}
                  className="text-xs font-medium text-accent underline-offset-4 hover:underline"
                >
                  Show all ({listings.length})
                </button>
              ) : null}
            </div>

            {visibleListings.map((listing) => (
              <JobListingCard
                key={listing.id}
                listing={listing}
                statuses={statuses}
                interactive={false}
              />
            ))}

            {isStreaming ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    // Fixed-length skeleton placeholders; index keys are stable here.
                    // biome-ignore lint/suspicious/noArrayIndexKey: static 3-item skeleton
                    key={`shimmer-${i}`}
                    className="animate-pulse rounded-2xl border border-stroke bg-surface-800 p-7"
                  >
                    <div className="mb-3 h-5 w-1/3 rounded bg-surface-700" />
                    <div className="mb-4 h-4 w-1/2 rounded bg-surface-700" />
                    <div className="h-3 w-full rounded bg-surface-700" />
                  </div>
                ))}
              </div>
            ) : null}

            {hasMore ? (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setVisibleCount((c) => c + 20)}
                  className="rounded-xl border border-stroke bg-surface-800 px-6 py-2.5 text-sm font-semibold text-foreground-900 transition hover:bg-surface-700"
                >
                  Load more ({listings.length - visibleCount} remaining)
                </button>
              </div>
            ) : null}

            {jobs.length > 0 && isStreaming ? (
              <p className="text-center text-xs text-foreground-600-subtle">
                Jobs appear as they&apos;re verified — summary follows when all
                subagents finish.
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
