"use client";

import { useEffect, useRef, useState } from "react";
import { getAvailableModelsAction } from "@/app/actions/research";
import type { ModelRef, ModelV2Info } from "@/lib/types/opencode";

const jobTypes = ["Remote", "Hybrid", "Onsite"];

export type UserPreferences = {
  model: ModelRef;
  modelLabel: string;
  jobTypes: string[];
  countries: string;
  skills: string;
  notes: string;
  resumeName?: string;
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
  const [skills, setSkills] = useState("");
  const [resumeName, setResumeName] = useState<string>();
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [countries, setCountries] = useState("");
  const [notes, setNotes] = useState("");

  const selectedModel = models.find((m) => `${m.providerID}/${m.id}` === selectedModelId) ?? null;
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
          // Default: Muse Spark 1.2 Free / OpenCode Zen / high (Free is part of name, not variant)
          const preferred =
            data.find((m) => m.name === "Muse Spark 1.2 Free" && m.providerID.toLowerCase().includes("opencode")) ??
            data.find((m) => m.id.toLowerCase().includes("muse-spark") && m.name.toLowerCase().includes("free")) ??
            data.find((m) => m.id.toLowerCase().includes("muse-spark")) ??
            data[0];
          setSelectedModelId(`${preferred.providerID}/${preferred.id}`);
          const preferredVariant = preferred.variants.find((v) => v.id === "high")?.id ?? preferred.variants.find((v) => v.id === "medium")?.id ?? preferred.variants[0]?.id;
          setVariant(preferredVariant);
        }
      } catch (e) {
        if (!cancelled) setModelsError(e instanceof Error ? e.message : "Failed to load models");
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
    setVariant(m?.variants[0]?.id ?? undefined);
  };

  const selectResume = (file?: File) => {
    if (file) setResumeName(file.name);
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

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedModel) return;
    const modelRef: ModelRef = {
      providerID: selectedModel.providerID,
      id: selectedModel.id,
      ...(variant ? { variant } : {}),
    };
    onStart?.({
      model: modelRef,
      modelLabel: `${selectedModel.providerID}/${selectedModel.id}${variant ? `:${variant}` : ""} — ${selectedModel.name}`,
      jobTypes: selectedJobTypes,
      countries,
      skills,
      notes,
      resumeName,
    });
  };

  return (
    <form className="space-y-7" onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-foreground-600">
            Model
          </span>
          <select
            value={selectedModelId}
            onChange={(event) => selectModel(event.target.value)}
            disabled={loadingModels}
            className="w-full rounded-xl border border-stroke bg-surface-800 px-4 py-3 text-foreground-900 outline-none transition-[border-color,box-shadow] focus:border-accent focus:shadow-[0_0_0_3px_var(--color-primary-ring)] disabled:opacity-50"
          >
            {loadingModels ? (
              <option>Loading models...</option>
            ) : modelsError ? (
              <option>Failed to load models</option>
            ) : (
              models.map((m) => (
                <option key={`${m.providerID}/${m.id}`} value={`${m.providerID}/${m.id}`}>
                  {m.providerID}/{m.id} — {m.name} {m.variants.length > 0 ? `(${m.variants.map((v) => v.id).join(", ")})` : ""}
                </option>
              ))
            )}
          </select>
          {selectedModel ? (
            <span className="mt-1 block text-xs text-foreground-600-subtle">
              {selectedModel.status} · context {selectedModel.limit?.context ?? "?"} · {hasVariants ? `${availableVariants.length} variants` : "no variants"}
            </span>
          ) : null}
          {modelsError ? <span className="mt-1 block text-xs text-rose-400">{modelsError}</span> : null}
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-foreground-600">
            Variant {hasVariants ? "" : "(no variants)"}
          </span>
          <select
            value={variant ?? ""}
            onChange={(event) => setVariant(event.target.value || undefined)}
            disabled={!hasVariants || loadingModels}
            className="w-full rounded-xl border border-stroke bg-surface-800 px-4 py-3 text-foreground-900 outline-none transition-[border-color,box-shadow] focus:border-accent focus:shadow-[0_0_0_3px_var(--color-primary-ring)] disabled:opacity-50"
          >
            {!hasVariants ? (
              <option value="">No variant (default)</option>
            ) : (
              availableVariants.map((v) => <option key={v} value={v}>{v}</option>)
            )}
          </select>
          <span className="mt-1 block text-xs text-foreground-600-subtle">
            {hasVariants ? "From ModelV2Info.variants[].id — variant is reasoning effort" : "This model ignores variant"}
          </span>
        </label>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <label
            htmlFor="skills"
            className="text-sm font-semibold text-foreground-600"
          >
            Skills / resume
          </label>
          <span className="text-xs text-foreground-600-subtle">
            Type skills or attach a PDF
          </span>
        </div>
        <fieldset
          className={`rounded-xl border bg-surface-800 p-2 transition-[border-color,box-shadow] ${
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
          <textarea
            id="skills"
            value={skills}
            onChange={(event) => setSkills(event.target.value)}
            placeholder="React, TypeScript, Node.js, system design..."
            rows={3}
            className="block w-full resize-none bg-transparent px-2 py-1.5 text-base leading-relaxed text-foreground-900 outline-none placeholder:text-foreground-600-subtle"
          />
          <div className="flex items-center justify-between gap-3 border-t border-stroke px-2 pt-2">
            <span className="truncate text-sm text-foreground-600-subtle">
              {resumeName ?? "Drop a resume here, or browse to attach one"}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={(event) => selectResume(event.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground-900 transition-colors hover:bg-accent hover:text-surface-900"
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
        </fieldset>
      </div>

      {isJobResearch ? (
        <>
          <fieldset>
            <legend className="mb-3 text-sm font-semibold text-foreground-600">
              Job types
            </legend>
            <div className="grid grid-cols-3 gap-3">
              {jobTypes.map((jobType) => {
                const isSelected = selectedJobTypes.includes(jobType);
                return (
                  <button
                    key={jobType}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => toggleJobType(jobType)}
                    className={`rounded-xl border px-3 py-4 text-sm font-semibold transition-[background-color,border-color,box-shadow,color] ${
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

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-foreground-600">
              Countries
            </span>
            <input
              type="text"
              value={countries}
              onChange={(e) => setCountries(e.target.value)}
              placeholder="USA, UK, Canada"
              className="w-full rounded-xl border border-stroke bg-surface-800 px-4 py-3 text-foreground-900 outline-none transition-[border-color,box-shadow] placeholder:text-foreground-600-subtle focus:border-accent focus:shadow-[0_0_0_3px_var(--color-primary-ring)]"
            />
          </label>
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
          rows={3}
          className="w-full resize-none rounded-xl border border-stroke bg-surface-800 px-4 py-3 text-foreground-900 outline-none transition-[border-color,box-shadow] placeholder:text-foreground-600-subtle focus:border-accent focus:shadow-[0_0_0_3px_var(--color-primary-ring)]"
        />
      </label>

      <button
        type="submit"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[var(--color-btn-primary-from)] to-[var(--color-btn-primary-to)] px-5 py-3.5 text-base font-bold text-[var(--color-btn-primary-text)] shadow-btn-primary transition-all duration-200 hover:brightness-105 hover:shadow-btn-primary-hover"
      >
        {actionLabel}
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
