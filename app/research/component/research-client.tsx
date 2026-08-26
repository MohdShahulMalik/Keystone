"use client";

import { useState } from "react";
import { Streamdown } from "streamdown";
import { startResearch } from "@/app/actions/research";
import {
  ResearchForm,
  type UserPreferences,
} from "@/app/research/component/research-form";
import { JobListingCard } from "@/components/cards/listings";
import { useResearchStream } from "@/hooks/useResearchStream";
import type { JobListing } from "@/lib/types/jobs";
import type { TextSegment } from "@/lib/types/research";
import type { JobStatus } from "@/lib/types/status";

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

const mockJobResults: JobListing[] = [];

function toList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function SegmentStream({ segments }: { segments: TextSegment[] }) {
  const blocks: React.ReactNode[] = [];
  let markdown = "";

  const flushMarkdown = (key: string) => {
    if (!markdown) return;
    const content = markdown;
    markdown = "";
    blocks.push(
      <div
        key={key}
        className="text-sm leading-relaxed text-foreground-600 [&_a]:text-accent [&_a]:underline [&_code]:font-mono [&_code]:text-accent [&_h1]:text-foreground-900 [&_h2]:text-foreground-900 [&_h3]:text-foreground-900 [&_h4]:text-foreground-900 [&_strong]:text-foreground-900 [&_table]:text-xs"
      >
        <Streamdown>{content}</Streamdown>
      </div>,
    );
  };

  const toolTone = (text: string) => {
    if (text.includes("✗")) return "border-l-danger";
    if (text.includes("✓")) return "border-l-success";
    return "border-l-accent";
  };

  segments.forEach((segment, i) => {
    if (segment.kind === "thinking") {
      flushMarkdown(`md-${i}`);
      blocks.push(
        <div
          key={segment.id}
          className="rounded-r-lg border-l-2 border-info/40 bg-surface-700/40 px-3 py-2 text-xs italic leading-relaxed text-foreground-600-subtle"
        >
          <span className="font-semibold not-italic text-info">Thinking:</span>{" "}
          <Streamdown>{segment.text}</Streamdown>
        </div>,
      );
      return;
    }

    if (segment.kind === "tool") {
      flushMarkdown(`md-${i}`);
      blocks.push(
        <div
          key={segment.id}
          className={`rounded-r-md border-l-2 ${toolTone(segment.text)} bg-surface-800 px-3 py-1.5 font-mono text-xs text-foreground-600-subtle [&_a]:text-accent [&_a]:underline [&_p]:my-0 [&_p]:whitespace-pre-wrap`}
        >
          <Streamdown>{segment.text}</Streamdown>
        </div>,
      );
      return;
    }

    markdown += segment.text;
  });
  flushMarkdown(`md-${segments.length}`);

  return <div className="space-y-3">{blocks}</div>;
}

export function ResearchClient({ mode, label }: ResearchClientProps) {
  const [openCodeSessionId, setOpenCodeSessionId] = useState<string | null>(
    null,
  );
  const [userPreferences, setUserPreferences] =
    useState<UserPreferences | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const { status, segments, error, reset } =
    useResearchStream(openCodeSessionId);

  const startResearchHandler = async (preferences: UserPreferences) => {
    setUserPreferences(preferences);
    setStartError(null);
    reset();

    try {
      const skills = toList(preferences.skills);
      const countries = toList(preferences.countries);

      const { openCodeSessionId: newSessionId } = await startResearch({
        jobTypes:
          preferences.jobTypes.length > 0 ? preferences.jobTypes : ["Any"],
        countries: countries.length > 0 ? countries : ["Current"],
        skills: skills.length > 0 ? skills : ["General"],
        notes: preferences.notes || undefined,
      });
      setOpenCodeSessionId(newSessionId);
    } catch (err) {
      setStartError(
        err instanceof Error ? err.message : "Failed to start research",
      );
    }
  };

  const started = openCodeSessionId !== null;
  const displayError = startError ?? error;

  return (
    <div className="mx-auto max-w-3xl">
      {!started ? (
        <section
          className="rounded-2xl border border-stroke bg-surface-700 p-5 shadow-lg sm:p-7"
          aria-label={`${label} configuration`}
        >
          {startError ? (
            <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/15 px-4 py-2 text-sm text-rose-400">
              {startError}
            </p>
          ) : null}
          <ResearchForm researchType={mode} onStart={startResearchHandler} />
        </section>
      ) : (
        <div className="space-y-8">
          <div className="flex items-center">
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
            <div className="flex justify-end">
              <div className="max-w-md rounded-2xl border border-stroke bg-surface-800 p-4 text-sm">
                {userPreferences && (
                  <div className="space-y-2 text-foreground-600">
                    <div>
                      <span className="font-medium text-foreground-900">
                        Model:
                      </span>{" "}
                      {userPreferences.model}
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
                )}
              </div>
            </div>

            <div className="flex justify-start">
              <div className="max-w-2xl">
                <div className="text-sm leading-relaxed text-foreground-600">
                  {segments.length > 0 ? (
                    <SegmentStream segments={segments} />
                  ) : (
                    "Waiting for agent output..."
                  )}
                  {status !== "completed" && status !== "error" ? (
                    <span className="ml-1 inline-block h-4 w-2 bg-accent align-middle" />
                  ) : null}
                </div>
                {displayError ? (
                  <p className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/15 px-4 py-2 text-sm text-rose-400">
                    {displayError}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {mode === "job" && status === "completed" ? (
            <section className="mt-12 space-y-4" aria-label="Job matches">
              <h3 className="text-lg font-semibold text-foreground-900">
                Matched jobs
              </h3>
              {mockJobResults.map((listing) => (
                <JobListingCard
                  key={listing.id}
                  listing={listing}
                  onStatusChange={() => {}}
                  statuses={statuses}
                />
              ))}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
