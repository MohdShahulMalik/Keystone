"use client";

import type { ReactNode } from "react";

type FiltersProps = {
  cardName: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onAdd: () => void;
  children?: ReactNode;
};

export function Filters({
  cardName,
  searchValue,
  onSearchChange,
  onAdd,
  children,
}: FiltersProps) {
  return (
    <section className="rounded-2xl border border-stroke-muted bg-surface-700 p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative block flex-1">
          <span className="sr-only">Search {cardName.toLowerCase()}s</span>
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-foreground-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"
            />
          </svg>
          <input
            className="w-full rounded-xl border border-stroke-muted bg-surface-800 py-3 pl-12 pr-4 text-foreground-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={`Search ${cardName.toLowerCase()}s...`}
            type="search"
            value={searchValue}
          />
        </label>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-surface-700 transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface-700"
          onClick={onAdd}
          type="button"
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 5v14m7-7H5"
            />
          </svg>
          Add {cardName}
        </button>
      </div>
      {children ? (
        <div className="mt-4 border-t border-stroke-muted pt-4">{children}</div>
      ) : null}
    </section>
  );
}
