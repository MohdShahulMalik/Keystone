"use client";

import { useRef, useState } from "react";

const baseModels = ["Claude", "GPT", "Gemini"];
const modelVariants: Record<string, string[]> = {
  Claude: ["Haiku", "Sonnet", "Opus"],
  GPT: ["Mini", "Medium", "High"],
  Gemini: ["Flash", "Pro", "Ultra"],
};

const jobTypes = ["Remote", "Hybrid", "Onsite"];

export type UserPreferences = {
  model: string;
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
  const [baseModel, setBaseModel] = useState("Claude");
  const [variant, setVariant] = useState("Sonnet");
  const [selectedJobTypes, setSelectedJobTypes] = useState<string[]>([
    "Remote",
  ]);
  const [skills, setSkills] = useState("");
  const [resumeName, setResumeName] = useState<string>();
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [countries, setCountries] = useState("");
  const [notes, setNotes] = useState("");

  const selectBaseModel = (nextModel: string) => {
    setBaseModel(nextModel);
    setVariant(modelVariants[nextModel][0]);
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
    onStart?.({
      model: `${baseModel} ${variant}`,
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
            Base model
          </span>
          <select
            value={baseModel}
            onChange={(event) => selectBaseModel(event.target.value)}
            className="w-full rounded-xl border border-stroke bg-surface-800 px-4 py-3 text-foreground-900 outline-none transition-[border-color,box-shadow] focus:border-accent focus:shadow-[0_0_0_3px_var(--color-primary-ring)]"
          >
            {baseModels.map((model) => (
              <option key={model}>{model}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-foreground-600">
            Variant
          </span>
          <select
            value={variant}
            onChange={(event) => setVariant(event.target.value)}
            className="w-full rounded-xl border border-stroke bg-surface-800 px-4 py-3 text-foreground-900 outline-none transition-[border-color,box-shadow] focus:border-accent focus:shadow-[0_0_0_3px_var(--color-primary-ring)]"
          >
            {modelVariants[baseModel].map((modelVariant) => (
              <option key={modelVariant}>{modelVariant}</option>
            ))}
          </select>
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
