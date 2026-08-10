"use client";

import { JobListing } from "@/lib/types/jobs";
import { useState } from "react";

interface JobListingCardProps {
  listing: JobListing;
  onStatusChange: (id: number, status: string) => void;
  statuses: readonly string[];
}

export function JobListingCard({
  listing,
  onStatusChange,
  statuses,
}: JobListingCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <article
      className="group rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] p-7 shadow-lg transition-all duration-200 hover:border-[var(--color-card-border-hover)] hover:shadow-[0_8px_24px_hsl(190_100%_42%_/_0.15)]"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-3">
            <h3 className="text-xl font-bold text-[var(--color-card-title)]">
              {listing.company}
            </h3>
          </div>

          <h4 className="mb-3 text-lg font-semibold text-[var(--color-card-subtitle)]">
            {listing.title}
          </h4>

          <div className="mb-4 flex items-center gap-4 text-sm">
            <span className="flex items-center gap-2 text-[var(--color-card-text)]">
              <span className="text-lg">💰</span>
              <span className="font-semibold">{listing.salary}</span>
            </span>
            <span className="text-[hsl(194_65%_62%_/_0.4)]">•</span>
            <span className="flex items-center gap-2 text-[var(--color-card-text)]">
              <span className="text-lg">📊</span>
              <span className="font-medium">{listing.experience}</span>
            </span>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <span className="flex items-center gap-2 rounded-lg border border-[var(--color-badge-border)] bg-[var(--color-badge-bg)] px-3.5 py-1.5 text-xs font-medium text-[var(--color-badge-text)]">
              <span>📍</span>
              {listing.location}
            </span>

            <span className="rounded-lg border border-[var(--color-visa-border)] bg-gradient-to-br from-[var(--color-visa-from)] to-[var(--color-visa-to)] px-3.5 py-1.5 text-xs font-semibold text-[var(--color-visa-text)]">
              {listing.visa}
            </span>

            <span
              className="flex items-center gap-2 rounded-lg border px-3.5 py-1.5 text-xs font-medium"
              data-status={listing.status}
              style={{
                backgroundColor: "var(--status-bg)",
                color: "var(--status-text)",
                borderColor: "var(--status-border)",
              }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: "var(--status-dot)" }}
              ></span>
              {listing.status}
            </span>
          </div>

          {listing.description && (
            <div>
              <p
                className={`text-sm leading-relaxed text-foreground-600 ${
                  isExpanded ? "" : "line-clamp-2"
                }`}
              >
                {listing.description}
              </p>
              {listing.description.length > 150 && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="mt-2 text-sm font-medium text-[var(--color-card-subtitle)] transition"
                  type="button"
                >
                  {isExpanded ? "Show less" : "Show more"}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="ml-8 flex shrink-0 flex-col items-end gap-3">
          {listing.status !== "Saved" ? (
            <>
              <div className="group/dropdown relative">
                <button
                  className="flex min-w-[160px] items-center justify-between gap-2.5 rounded-lg border border-[var(--color-btn-secondary-border)] bg-gradient-to-br from-[var(--color-btn-secondary-from)] to-[var(--color-btn-secondary-to)] px-5 py-2.5 text-sm font-medium text-[var(--color-btn-secondary-text)] shadow-[0_3px_10px_hsl(190_100%_42%_/_0.2)] transition-all duration-200 ease-out hover:brightness-105 hover:shadow-[0_4px_14px_hsl(190_100%_42%_/_0.24)]"
                  type="button"
                >
                  <span>{listing.status}</span>
                  <svg
                    className="h-4 w-4 transition-transform duration-200 group-hover/dropdown:rotate-180"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                <div className="absolute right-0 top-full z-10 mt-2 w-48 overflow-hidden rounded-xl border border-[var(--color-dropdown-border)] bg-[var(--color-dropdown-bg)] opacity-0 shadow-2xl transition-all duration-200 group-hover/dropdown:visible group-hover/dropdown:opacity-100 invisible">
                  {statuses
                    .filter((s) => s !== "All" && s !== listing.status)
                    .map((status) => (
                      <button
                        key={status}
                        onClick={() => onStatusChange(listing.id, status)}
                        className="block w-full px-4 py-3 text-left text-sm text-[var(--color-badge-text)] transition-all duration-200 ease-out first:rounded-t-xl last:rounded-b-xl hover:bg-[var(--color-dropdown-hover-bg)] hover:text-[var(--color-dropdown-hover-text)]"
                        type="button"
                      >
                        {status}
                      </button>
                    ))}
                </div>
              </div>

              <button
                className="flex items-center gap-2 rounded-lg border border-[var(--color-visit-border)] bg-transparent px-6 py-2.5 text-sm font-semibold text-[var(--color-visit-text)] transition-all duration-200 ease-out hover:border-[var(--color-visit-border-hover)] hover:bg-[var(--color-visit-bg-hover)] hover:text-[var(--color-visit-text-hover)] hover:shadow-[0_2px_10px_hsl(190_100%_42%_/_0.14)]"
                type="button"
              >
                <span>Visit</span>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </button>
            </>
          ) : (
            <button
              className="flex items-center gap-2.5 rounded-xl bg-gradient-to-br from-[var(--color-btn-primary-from)] to-[var(--color-btn-primary-to)] px-7 py-3 text-sm font-bold text-[var(--color-btn-primary-text)] shadow-[0_4px_16px_hsl(190_100%_42%_/_0.4)] transition-all duration-200 ease-out hover:brightness-105 hover:shadow-[0_6px_20px_hsl(190_100%_42%_/_0.48)]"
              type="button"
            >
              <span>Apply Now</span>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
