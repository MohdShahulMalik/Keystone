"use client";

import { useRef, useState } from "react";
import type { JobListing } from "@/lib/types/jobs";
import type { JobStatus } from "@/lib/types/status";

interface JobListingCardProps {
  listing: JobListing;
  onStatusChange: (id: string, status: JobStatus) => void;
  statuses: readonly JobStatus[];
}

function formatStatusLabel(status: JobStatus) {
  return status
    .toLowerCase()
    .split(/[\s_-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusDataAttribute(status: JobStatus): string {
  const statusMap: Record<JobStatus, string> = {
    OPEN: "Saved",
    APPLIED: "Applied",
    INTERVIEW: "Interview",
    OFFER: "Offer",
    REJECTED: "Rejected",
    DECLINED: "Declined",
  };
  return statusMap[status];
}

export function JobListingCard({
  listing,
  onStatusChange,
  statuses,
}: JobListingCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const buttonSpanRef = useRef<HTMLSpanElement | null>(null);
  const buttonSvgRef = useRef<SVGSVGElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const secondaryButtonClass =
    "flex items-center gap-2 rounded-lg border border-visit-border bg-transparent px-6 py-2.5 text-base font-semibold text-[var(--color-visit-text)] transition-all duration-200 ease-out hover:border-[var(--color-visit-border-hover)] hover:bg-[var(--color-visit-bg-hover)] hover:text-[var(--color-visit-text-hover)] hover:shadow-[0_2px_10px_hsl(190_100%_42%_/_0.14)]";

  const processOpenStatus = (listing: JobListing) => {
    const buttonSpan = buttonSpanRef.current;
    const buttonSvg = buttonSvgRef.current;
    const button = buttonRef.current;

    if (!buttonSpan) return;

    if (buttonSpan?.textContent === "Apply Now") {
      window.open(listing.url as string, "_blank");
      buttonSpan.textContent = "Applied?";
      if (buttonSvg) buttonSvg.style.display = "none";
      if (button) button.className = secondaryButtonClass;
    } else {
      onStatusChange(listing.id, "APPLIED");
    }
  };

  return (
    <article className="group rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] p-7 shadow-lg transition-all duration-200 hover:border-(--color-card-border-hover) hover:shadow-[0_8px_24px_hsl(190_100%_42%/0.15)]">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-3">
            <h3 className="text-xl font-bold text-(--color-card-title)">
              {listing.company}
            </h3>
          </div>

          <h4 className="mb-3 text-lg font-semibold text-[var(--color-card-subtitle)]">
            {listing.title}
          </h4>

          <div className="mb-4 flex items-center gap-4 text-sm">
            <span className="flex items-center gap-2 text-[var(--color-card-text)]">
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="font-semibold">{listing.salary || "N.A."}</span>
            </span>
            <span className="text-[hsl(194_65%_62%_/_0.4)]">•</span>
            <span className="flex items-center gap-2 text-[var(--color-card-text)]">
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              <span className="font-medium">{listing.experience}</span>
            </span>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <span className="flex items-center gap-2 rounded-lg border border-[var(--color-badge-border)] bg-[var(--color-badge-bg)] px-3.5 py-1.5 text-xs font-medium text-[var(--color-badge-text)]">
              <span>📍</span>
              {listing.location}
            </span>

            {listing.visa ? (
              <span className="rounded-lg border border-[var(--color-visa-border)] bg-gradient-to-br from-[var(--color-visa-from)] to-[var(--color-visa-to)] px-3.5 py-1.5 text-xs font-semibold text-[var(--color-visa-text)]">
                {listing.visa}
              </span>
            ) : null}

            <span
              className="flex items-center gap-2 rounded-lg border border-[var(--status-border)] bg-[var(--status-bg)] px-3.5 py-1.5 text-xs font-medium text-[var(--status-text)]"
              data-status={getStatusDataAttribute(listing.status)}
            >
              <span className="h-2 w-2 rounded-full bg-[var(--status-dot)]" />
              {formatStatusLabel(listing.status)}
            </span>
          </div>

          {listing.description ? (
            <div>
              <p className="text-sm leading-relaxed text-foreground-600">
                {isExpanded || listing.description.length <= 250
                  ? listing.description
                  : `${listing.description.slice(0, 250)}...`}
              </p>
              {listing.description.length > 250 ? (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="mt-2 text-sm font-medium text-[var(--color-card-subtitle)] transition"
                  type="button"
                >
                  {isExpanded ? "Show less" : "Show more"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="ml-8 flex shrink-0 flex-col items-end gap-3">
          {listing.status !== "OPEN" ? (
            <>
              <div className="group/dropdown relative">
                <button
                  className="flex min-w-[160px] items-center justify-between gap-2.5 rounded-lg border border-[var(--color-btn-secondary-border)] bg-gradient-to-br from-[var(--color-btn-secondary-from)] to-[var(--color-btn-secondary-to)] px-5 py-2.5 text-base font-medium text-[var(--color-btn-secondary-text)] shadow-[0_3px_10px_hsl(190_100%_42%_/_0.2)] transition-all duration-200 ease-out hover:brightness-105 hover:shadow-[0_4px_14px_hsl(190_100%_42%_/_0.24)]"
                  type="button"
                >
                  <span>{formatStatusLabel(listing.status)}</span>
                  <svg
                    className="h-4 w-4 transition-transform duration-200 group-hover/dropdown:rotate-180"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                <div className="invisible absolute right-0 top-full z-10 mt-2 w-48 overflow-hidden rounded-xl border border-(--color-dropdown-border) bg-(--color-dropdown-bg) opacity-0 shadow-2xl transition-all duration-200 group-hover/dropdown:visible group-hover/dropdown:opacity-100">
                  {statuses
                    .filter((status) => status !== listing.status)
                    .map((status) => (
                      <button
                        key={`${listing.id}-${status}`}
                        onClick={() => onStatusChange(listing.id, status)}
                        className="block w-full px-4 py-3 text-left text-base text-[var(--color-badge-text)] transition-all duration-200 ease-out first:rounded-t-xl last:rounded-b-xl hover:bg-[var(--color-dropdown-hover-bg)] hover:text-[var(--color-dropdown-hover-text)]"
                        type="button"
                      >
                        {formatStatusLabel(status)}
                      </button>
                    ))}
                </div>
              </div>

              <button className={secondaryButtonClass} type="button">
                <span>Visit</span>
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
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </button>
            </>
          ) : (
            <button
              className="flex items-center gap-2.5 rounded-xl bg-gradient-to-br from-[var(--color-btn-primary-from)] to-[var(--color-btn-primary-to)] px-7 py-3 font-bold text-btn-primary-text shadow-[0_4px_16px_hsl(190_100%_42%_/_0.4)] transition-all duration-200 ease-out hover:brightness-105 hover:shadow-[0_6px_20px_hsl(190_100%_42%_/_0.48)]"
              type="button"
              ref={buttonRef}
              onClick={() => processOpenStatus(listing)}
            >
              <span ref={buttonSpanRef}>Apply Now</span>
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
                ref={buttonSvgRef}
              >
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
