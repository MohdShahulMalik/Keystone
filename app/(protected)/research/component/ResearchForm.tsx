"use client";

import { useEffect, useRef, useState } from "react";
import { getAvailableModelsAction } from "@/app/actions/research";
import { updateResume, uploadResume } from "@/app/actions/resumes";
import type { ModelRef, ModelV2Info } from "@/lib/types/opencode";
import { GLM_5_3_FLASH_FREE_REF } from "@/lib/types/opencode";
import { TagInput } from "./TagInput";

const jobTypes = ["Remote", "Hybrid", "Onsite"];

const SUGGESTED_SKILLS = [
  "React",
  "TypeScript",
  "JavaScript",
  "Node.js",
  "Next.js",
  "Python",
  "Java",
  "Go",
  "Rust",
  "SQL",
  "PostgreSQL",
  "AWS",
  "Docker",
  "Kubernetes",
  "System Design",
  "GraphQL",
  "Tailwind CSS",
  "Prisma",
];

const SUGGESTED_COUNTRIES = [
  "USA",
  "UK",
  "Canada",
  "Germany",
  "Netherlands",
  "Ireland",
  "France",
  "Spain",
  "Portugal",
  "Poland",
  "India",
  "Singapore",
  "Australia",
  "Remote",
];

export type UserPreferences = {
  model: ModelRef;
  modelLabel: string;
  jobTypes: string[];
  countries: string;
  skills: string;
  notes: string;
  resumeName?: string;
  resumeId?: string;
};

type ResearchFormProps = {
  researchType: "job" | "dsa";
  onStart?: (preferences: UserPreferences) => void;
};

export function ResearchForm({ researchType, onStart }: ResearchFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [models, setModels] = useState<ModelV2Info[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [variant, setVariant] = useState<string | undefined>(undefined);
  const [loadingModels, setLoadingModels] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [selectedJobTypes, setSelectedJobTypes] = useState<string[]>([
    "Remote",
  ]);
  const [skills, setSkills] = useState<string[]>([]);
  const [resumeName, setResumeName] = useState<string>();
  const [resumeId, setResumeId] = useState<string>();
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [countries, setCountries] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  const selectedModel =
    models.find((m) => `${m.providerID}/${m.id}` === selectedModelId) ?? null;
  const availableVariants = selectedModel?.variants.map((v) => v.id) ?? [];
  const hasVariants = availableVariants.length > 0;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getAvailableModelsAction();
        if (cancelled) return;
        setModels(data);
        if (data.length > 0) {
          // Default: GLM-5.3-Flash Free — verified via the OpenCode SDK models
          // endpoint: opencode/glm-5.3-flash-free — GLM-5.3-Flash Free — active.
          // Hardcoded ref is GLM_5_3_FLASH_FREE_REF but still dynamic so user can pick others.
          const preferred =
            data.find(
              (m) =>
                m.providerID === GLM_5_3_FLASH_FREE_REF.providerID &&
                m.id === GLM_5_3_FLASH_FREE_REF.id,
            ) ??
            data.find(
              (m) =>
                m.name === "GLM-5.3-Flash Free" &&
                m.providerID.toLowerCase().includes("opencode"),
            ) ??
            data.find((m) =>
              m.id.toLowerCase().includes("glm-5.3-flash-free"),
            ) ??
            data.find((m) => m.id.toLowerCase().includes("glm")) ??
            data[0];
          setSelectedModelId(`${preferred.providerID}/${preferred.id}`);
          const preferredVariant =
            preferred.variants.find((v) => v.id === "high")?.id ??
            preferred.variants[0]?.id;
          setVariant(preferredVariant);
        }
      } catch (e) {
        if (!cancelled)
          setModelsError(
            e instanceof Error ? e.message : "Failed to load models",
          );
      } finally {
        if (!cancelled) setLoadingModels(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectModel = (nextId: string) => {
    setSelectedModelId(nextId);
    const m = models.find((x) => `${x.providerID}/${x.id}` === nextId);
    // Default to "high" when available; otherwise fall back to the first variant.
    setVariant(
      m?.variants.find((v) => v.id === "high")?.id ?? m?.variants[0]?.id,
    );
  };

  const clearResume = () => {
    setResumeName(undefined);
    setResumeId(undefined);
    setResumeError(null);
  };

  const selectResume = async (file?: File) => {
    if (!file) return;
    // Match server-side resumeFileSchema rules so obviously wrong files fail
    // locally with the same message.
    if (file.type !== "application/pdf") {
      clearResume();
      setResumeError("Only PDF files are allowed");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      clearResume();
      setResumeError("File size must be under 5MB");
      return;
    }

    setResumeError(null);
    setResumeName(file.name);
    setIsUploadingResume(true);
    setResumeId(undefined);
    try {
      let result = await uploadResume(file);
      if (
        !result.success &&
        typeof result.error === "string" &&
        result.error.includes("already exists")
      ) {
        // One resume per user (unique on userId) — a second choice is an
        // update of the stored one.
        result = await updateResume(file);
      }
      if (result.success) {
        setResumeId(result.data.id);
        setResumeError(null);
      } else {
        clearResume();
        setResumeError(
          typeof result.error === "string"
            ? result.error
            : "Failed to upload resume",
        );
      }
    } catch (error) {
      clearResume();
      setResumeError(
        error instanceof Error ? error.message : "Failed to upload resume",
      );
    } finally {
      setIsUploadingResume(false);
    }
  };

  const toggleJobType = (jobType: string) => {
    setSelectedJobTypes((current) =>
      current.includes(jobType)
        ? current.filter((type) => type !== jobType)
        : [...current, jobType],
    );
  };

  const isJobResearch = researchType === "job";
  const actionLabel = isJobResearch
    ? "Start job research"
    : "Start DSA research";

  const handleSubmit = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedModel) return;
    const modelRef: ModelRef = {
      providerID: selectedModel.providerID,
      id: selectedModel.id,
      ...(variant ? { variant } : {}),
    };
    onStart?.({
      model: modelRef,
      modelLabel:
        selectedModel.name.split(" — ").slice(-1)[0].trim() +
        (variant ? ` — ${variant}` : ""),
      jobTypes: selectedJobTypes,
      countries: countries.join(", "),
      skills: skills.join(", "),
      notes,
      resumeName,
      resumeId,
    });
  };

  return (
    <form className="min-w-0 space-y-6 sm:space-y-7" onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-foreground-600">
            Model
          </span>
          <select
            value={selectedModelId}
            onChange={(event) => selectModel(event.target.value)}
            disabled={loadingModels}
            style={{ scrollbarWidth: "none" } as React.CSSProperties}
            className="w-full rounded-xl border border-stroke bg-surface-800 px-4 py-3 text-foreground-900 outline-none transition-[border-color,box-shadow] focus:border-accent focus:shadow-[0_0_0_3px_var(--color-primary-ring)] disabled:opacity-50 overflow-y-hidden [&::-webkit-scrollbar]:hidden"
          >
            {loadingModels ? (
              <option>Loading models...</option>
            ) : modelsError ? (
              <option>Failed to load models</option>
            ) : (
              models.map((m) => (
                <option
                  key={`${m.providerID}/${m.id}`}
                  value={`${m.providerID}/${m.id}`}
                >
                  {m.name}
                </option>
              ))
            )}
          </select>
          {modelsError ? (
            <span className="mt-1 block text-xs text-rose-400">
              {modelsError}
            </span>
          ) : null}
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-foreground-600">
            Variant
          </span>
          <select
            value={variant ?? ""}
            onChange={(event) => setVariant(event.target.value || undefined)}
            disabled={!hasVariants || loadingModels}
            style={{ scrollbarWidth: "none" } as React.CSSProperties}
            className="w-full rounded-xl border border-stroke bg-surface-800 px-4 py-3 text-foreground-900 outline-none transition-[border-color,box-shadow] focus:border-accent focus:shadow-[0_0_0_3px_var(--color-primary-ring)] disabled:opacity-50 overflow-y-hidden [&::-webkit-scrollbar]:hidden"
          >
            {!hasVariants ? (
              <option value="">No variant (default)</option>
            ) : (
              availableVariants.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))
            )}
          </select>
        </label>
      </div>

      <div>
        <label
          htmlFor="skills"
          className="mb-2 block text-sm font-semibold text-foreground-600"
        >
          Skills / resume
        </label>
        <fieldset
          className={`rounded-xl border bg-surface-800 transition-[border-color,box-shadow] focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--color-primary-ring)] ${
            isDraggingFile
              ? "border-accent shadow-[0_0_0_3px_var(--color-primary-ring)]"
              : "border-stroke"
          }`}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDraggingFile(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setIsDraggingFile(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDraggingFile(false);
            selectResume(event.dataTransfer.files[0]);
          }}
        >
          <TagInput
            id="skills"
            value={skills}
            onChange={setSkills}
            suggestions={SUGGESTED_SKILLS}
            placeholder="React, TypeScript, Node.js..."
            bare
          />
          <div className="flex min-w-0 items-center justify-between gap-3 border-t border-stroke px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm text-foreground-600-subtle">
              {isUploadingResume
                ? `Uploading ${resumeName ?? "resume"}…`
                : (resumeName ?? "Drop a resume here, or browse to attach one")}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={(event) => void selectResume(event.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingResume}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground-900 transition-colors hover:bg-accent hover:text-surface-900 disabled:cursor-wait disabled:opacity-60"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 16V4m0 0L8 8m4-4 4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"
                />
              </svg>
              Upload resume
            </button>
          </div>
          {resumeError ? (
            <div className="flex items-center justify-between gap-3 border-t border-stroke px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-xs text-rose-400">
                {resumeError}
              </span>
              <button
                type="button"
                onClick={clearResume}
                className="shrink-0 text-xs font-medium text-accent underline-offset-4 hover:underline"
              >
                Reset
              </button>
            </div>
          ) : null}
        </fieldset>
      </div>

      {isJobResearch ? (
        <>
          <fieldset>
            <legend className="mb-3 text-sm font-semibold text-foreground-600">
              Job types
            </legend>
            <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-3 min-[480px]:gap-3">
              {jobTypes.map((jobType) => {
                const isSelected = selectedJobTypes.includes(jobType);
                return (
                  <button
                    key={jobType}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => toggleJobType(jobType)}
                    className={`min-h-[48px] rounded-xl border px-3 py-3 text-sm font-semibold transition-[background-color,border-color,box-shadow,color] min-[480px]:py-4 ${
                      isSelected
                        ? "border-filter-chip-active-border bg-gradient-to-br from-filter-chip-active-from to-filter-chip-active-to text-foreground-900 shadow-filter-chip-active"
                        : "border-stroke bg-surface-800 text-foreground-600 hover:border-accent hover:text-foreground-900"
                    }`}
                  >
                    {jobType}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <span className="mb-2 block text-sm font-semibold text-foreground-600">
              Countries
            </span>
            <TagInput
              id="countries"
              value={countries}
              onChange={setCountries}
              suggestions={SUGGESTED_COUNTRIES}
              placeholder="USA, UK, Canada..."
            />
          </div>
        </>
      ) : null}

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-foreground-600">
          Notes
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Additional instructions for the research agent..."
          rows={2}
          className="w-full resize-none rounded-xl border border-stroke bg-surface-800 px-4 py-3 text-foreground-900 outline-none transition-[border-color,box-shadow] placeholder:text-foreground-600-subtle focus:border-accent focus:shadow-[0_0_0_3px_var(--color-primary-ring)]"
        />
      </label>

      <button
        type="submit"
        disabled={isUploadingResume}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[var(--color-btn-primary-from)] to-[var(--color-btn-primary-to)] px-5 py-3.5 text-base font-bold text-[var(--color-btn-primary-text)] shadow-btn-primary transition-all duration-200 enabled:hover:brightness-105 enabled:hover:shadow-btn-primary-hover disabled:cursor-wait disabled:opacity-70"
      >
        {isUploadingResume ? "Uploading resume…" : actionLabel}
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 7l5 5m0 0-5 5m5-5H6"
          />
        </svg>
      </button>
    </form>
  );
}
