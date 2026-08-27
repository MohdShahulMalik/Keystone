"use client";

import { useState } from "react";
import { startResearch } from "@/app/actions/research";
import {
  ResearchForm,
  type UserPreferences,
} from "@/app/research/component/research-form";
import { AgentResponse } from "@/components/agent-response";
import { JobListingCard } from "@/components/cards/listings";
import { useResearchStream } from "@/hooks/useResearchStream";
import type { JobListing } from "@/lib/types/jobs";
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

            <AgentResponse
              segments={segments}
              status={status}
              error={displayError}
            />
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
