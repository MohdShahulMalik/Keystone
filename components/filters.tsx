"use client";

import type { ReactNode } from "react";

type FiltersProps = {
  cardName: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onAdd: () => void;
  selectedStatuses?: string[];
  onToggleStatus?: (status: string) => void;
  statuses?: string[];
  children?: ReactNode;
};

export function Filters({
  cardName,
  searchValue,
  onSearchChange,
  onAdd,
  selectedStatuses = [],
  onToggleStatus,
  statuses = [],
  children,
}: FiltersProps) {
  return (
    <div className="rounded-2xl border border-stroke bg-surface-700 p-5 shadow-lg">
      <div className="mb-5 flex items-stretch gap-3">
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
            <svg
              className="h-5 w-5 text-foreground-600-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search by title, company, or location..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-xl border border-stroke bg-surface-800 py-3.5 pl-12 pr-4 text-foreground-900 shadow-sm outline-none transition-all duration-200 placeholder:text-foreground-600-subtle focus:border-primary focus:ring-4 focus:ring-primary-ring"
          />
        </div>

        <button
          onClick={onAdd}
          className="shadow-btn-primary shadow-btn-primary-hover shrink-0 rounded-lg bg-gradient-to-br from-btn-primary-from to-btn-primary-to px-6 py-2.5 text-sm font-semibold text-btn-primary-text transition-[filter,box-shadow] duration-200 ease-out hover:brightness-105"
        >
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add {cardName}
          </span>
        </button>
      </div>

      {statuses.length > 0 && onToggleStatus ? (
        <div className="border-t border-stroke pt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-foreground-600">Status</span>
            <span className="text-xs text-foreground-600-subtle">Multi-select</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {statuses.map((status) => {
              const isSelected = selectedStatuses.includes(status);

              return (
                <button
                  key={status}
                  onClick={() => onToggleStatus(status)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-200 ease-out ${
                    isSelected
                      ? "border-filter-chip-active-border bg-gradient-to-br from-filter-chip-active-from to-filter-chip-active-to text-foreground-900 shadow-filter-chip-active"
                      : "border-stroke bg-surface-800 text-foreground-600"
                  }`}
                >
                  {status}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {children ? (
        <div className="mt-4 border-t border-stroke pt-4">{children}</div>
      ) : null}
    </div>
  );
}
