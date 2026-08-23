"use client";

import { useState } from "react";
import { JobListingCard } from "@/components/cards/listings";
import {
  ResearchForm,
  type UserPreferences,
} from "@/app/research/component/research-form";
import { useResearchStream } from "@/hooks/useResearchStream";
import { startResearch } from "@/app/actions/research";
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

const mockJobResults: JobListing[] = [
  {
    id: "job-1",
    userId: "demo",
    title: "Junior Frontend Engineer",
    company: "Keystone Labs",
    location: "Remote",
    url: "https://example.com/job/frontend",
    description: "Build user-facing workflows for the research platform.",
    salary: "$70k-$90k",
    experience: "Entry Level",
    visa: "Global remote",
    type: "remote",
    country: "Remote",
    status: "OPEN",
    notes: null,
    appliedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "job-2",
    userId: "demo",
    title: "AI Operations Associate",
    company: "VectorFlow",
    location: "Austin, TX",
    url: "https://example.com/job/ai-ops",
    description: "Support AI pipelines, tooling, and evaluation workflows.",
    salary: "$85k-$105k",
    experience: "Junior",
    visa: "US only",
    type: "hybrid",
    country: "USA",
    status: "OPEN",
    notes: null,
    appliedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "job-3",
    userId: "demo",
    title: "Research Engineer Intern",
    company: "SignalStack",
    location: "Berlin, Germany",
    url: "https://example.com/job/research-intern",
    description: "Support applied research and experiment tooling.",
    salary: null,
    experience: "Intern",
    visa: "EU eligible",
    type: "onsite",
    country: "Germany",
    status: "OPEN",
    notes: null,
    appliedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

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

  const { status, mainText, error, reset } =
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
        countries: countries.length > 0 ? countries : ["Any"],
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
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground-600">
                  {mainText || "Waiting for agent output..."}
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
