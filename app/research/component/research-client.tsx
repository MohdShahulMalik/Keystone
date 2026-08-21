"use client";

import { useRef, useState } from "react";
import { JobListingCard } from "@/components/cards/listings";
import { ResearchForm, type UserPreferences } from "@/app/research/component/research-form";
import type { JobListing } from "@/lib/types/jobs";
import type { JobStatus } from "@/lib/types/status";

type ResearchClientProps = {
  mode: "job" | "dsa";
  label: string;
};

type Phase = "idle" | "connecting" | "running" | "completed";

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

export function ResearchClient({ mode, label }: ResearchClientProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [responseText, setResponseText] = useState("");
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startResearch = (preferences: UserPreferences) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    setUserPreferences(preferences);
    setPhase("connecting");
    setResponseText("");

    timeoutRef.current = setTimeout(() => {
      setPhase("running");

      const messages = [
        "Initializing research agent...\n",
        "Loading configuration...\n",
        "Searching public job boards and communities...\n",
        "Aggregating role signals and filtering by fit...\n",
        "Ranking results by location and skill match...\n",
        "Finalizing report and recommendations...\n",
        "Research complete.\n",
      ];

      let index = 0;
      intervalRef.current = setInterval(() => {
        setResponseText((current) => current + messages[index]);
        index += 1;

        if (index >= messages.length) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setPhase("completed");
        }
      }, 700);
    }, 800);
  };

  return (
    <div className="mx-auto max-w-3xl">
      {phase === "idle" ? (
        <section
          className="rounded-2xl border border-stroke bg-surface-700 p-5 shadow-lg sm:p-7"
          aria-label={`${label} configuration`}
        >
          <ResearchForm researchType={mode} onStart={startResearch} />
        </section>
      ) : (
        <div className="space-y-8">
          <div className="flex items-center">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
                phase === "completed"
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                  : "border-sky-500/30 bg-sky-500/15 text-sky-400"
              }`}
            >
              {phase === "completed" ? "Completed" : "Running"}
            </span>
          </div>

          <div className="space-y-6">
            <div className="flex justify-end">
              <div className="max-w-md rounded-2xl border border-stroke bg-surface-800 p-4 text-sm">
                {userPreferences && (
                  <div className="space-y-2 text-foreground-600">
                    <div>
                      <span className="font-medium text-foreground-900">Model:</span>{" "}
                      {userPreferences.model}
                    </div>
                    <div>
                      <span className="font-medium text-foreground-900">Job Types:</span>{" "}
                      {userPreferences.jobTypes.join(", ")}
                    </div>
                    <div>
                      <span className="font-medium text-foreground-900">Countries:</span>{" "}
                      {userPreferences.countries || "Any"}
                    </div>
                    <div>
                      <span className="font-medium text-foreground-900">Skills:</span>{" "}
                      {userPreferences.skills || "None specified"}
                    </div>
                    {userPreferences.resumeName ? (
                      <div>
                        <span className="font-medium text-foreground-900">Resume:</span>{" "}
                        {userPreferences.resumeName}
                      </div>
                    ) : null}
                    {userPreferences.notes ? (
                      <div>
                        <span className="font-medium text-foreground-900">Notes:</span>{" "}
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
                  {responseText || "Waiting for agent output..."}
                  {phase !== "completed" ? (
                    <span className="ml-1 inline-block h-4 w-2 bg-accent align-middle" />
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {mode === "job" && phase === "completed" ? (
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
