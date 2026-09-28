"use client";

import { useId, useMemo, useRef, useState } from "react";

type TagInputProps = {
  id?: string;
  label?: string;
  value: string[];
  onChange: (next: string[]) => void;
  suggestions: string[];
  placeholder?: string;
  bare?: boolean;
};

function normalize(item: string): string {
  return item.trim().toLowerCase();
}

export function TagInput({
  id,
  value,
  onChange,
  suggestions,
  placeholder = "Type and press Enter",
  bare = false,
}: TagInputProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const listboxId = `${inputId}-listbox`;
  const [draft, setDraft] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => new Set(value.map(normalize)), [value]);

  const matches = useMemo(() => {
    const query = normalize(draft);
    return suggestions
      .filter((item) => !selected.has(normalize(item)))
      .filter((item) =>
        query.length === 0 ? true : normalize(item).includes(query),
      )
      .slice(0, 8);
  }, [draft, suggestions, selected]);

  const options = useMemo(() => {
    const trimmed = draft.trim();
    if (!trimmed) return matches;
    // Only offer the raw typed text when it resembles nothing curated.
    if (matches.length > 0) return matches;
    if (selected.has(normalize(trimmed))) return matches;
    return [trimmed];
  }, [draft, matches, selected]);

  const commit = (raw: string) => {
    const cleaned = raw.trim().replace(/,+/g, " ").replace(/\s+/g, " ").trim();
    if (!cleaned) return;
    if (selected.has(normalize(cleaned))) {
      setDraft("");
      return;
    }
    onChange([...value, cleaned]);
    setDraft("");
    setActiveIndex(0);
  };

  const commitMany = (raw: string) => {
    const parts = raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...value];
    const seen = new Set(next.map(normalize));
    for (const part of parts) {
      if (!seen.has(normalize(part))) {
        seen.add(normalize(part));
        next.push(part);
      }
    }
    onChange(next);
    setDraft("");
    setActiveIndex(0);
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
    inputRef.current?.focus();
  };

  const showDropdown = open && draft.trim().length > 0 && options.length > 0;

  return (
    <div className="relative">
      {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: click-to-focus wrapper, the inner input stays keyboard accessible */}
      <div
        onClick={() => inputRef.current?.focus()}
        className={
          bare
            ? "flex min-h-13 cursor-text flex-wrap items-center gap-2 bg-transparent px-3 py-2 outline-none"
            : "flex min-h-13 cursor-text flex-wrap items-center gap-2 rounded-xl border border-stroke bg-surface-800 px-3 py-2 outline-none transition-[border-color,box-shadow] focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--color-primary-ring)]"
        }
      >
        {value.map((item, index) => (
          <span
            key={`${normalize(item)}-${index}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stroke bg-surface-700 py-1 pl-2.5 pr-1.5 text-sm font-medium text-foreground-900"
          >
            {item}
            <button
              type="button"
              onClick={() => removeAt(index)}
              aria-label={`Remove ${item}`}
              className="inline-flex h-5 w-5 items-center justify-center rounded-md text-foreground-600-subtle transition-colors hover:bg-surface-800 hover:text-foreground-900"
            >
              <svg
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={inputId}
          value={draft}
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={value.length === 0 ? placeholder : ""}
          onChange={(event) => {
            setDraft(event.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so a suggestion click registers before the list closes.
            window.setTimeout(() => {
              setOpen(false);
              setActiveIndex(0);
            }, 120);
          }}
          onPaste={(event) => {
            const text = event.clipboardData.getData("text");
            if (!text.includes(",")) return;
            event.preventDefault();
            commitMany(text);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && showDropdown) {
              event.preventDefault();
              setActiveIndex((i) => (i + 1) % options.length);
            } else if (event.key === "ArrowUp" && showDropdown) {
              event.preventDefault();
              setActiveIndex((i) => (i - 1 + options.length) % options.length);
            } else if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              if (showDropdown && draft.trim()) {
                commit(options[activeIndex] ?? draft);
              } else {
                commit(draft);
              }
            } else if (event.key === "Tab" && draft.trim()) {
              // Let Tab move focus when there is nothing typed.
              event.preventDefault();
              commit(draft);
            } else if (
              event.key === "Backspace" &&
              draft === "" &&
              value.length > 0
            ) {
              removeAt(value.length - 1);
            } else if (event.key === "Escape") {
              setOpen(false);
              setActiveIndex(0);
            }
          }}
          className="min-w-32 flex-1 bg-transparent py-1.5 text-base text-foreground-900 outline-none placeholder:text-foreground-600-subtle"
        />
      </div>
      {showDropdown ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Suggestions"
          className="absolute top-full right-0 left-0 z-10 mt-2 overflow-hidden rounded-xl border border-stroke bg-surface-800 shadow-lg"
        >
          {options.map((item, index) => (
            <div key={item}>
              <button
                type="button"
                tabIndex={-1}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  commit(item);
                  inputRef.current?.focus();
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full items-center px-4 py-2.5 text-left text-sm transition-colors ${
                  index === activeIndex
                    ? "bg-secondary text-foreground-900"
                    : "text-foreground-600"
                }`}
              >
                {item}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
