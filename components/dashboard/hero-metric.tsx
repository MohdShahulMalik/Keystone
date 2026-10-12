import {
  appsPerDay,
  countStatuses,
  dayStreak,
  sparkPoints,
  WEEKS,
  weekBuckets,
} from "@/lib/dashboard/metrics";
import type { JobListing } from "@/lib/types/jobs";
import { Pill, SectionLabel, Tile } from "./tile";

export function HeroMetricCard({ listings }: { listings: JobListing[] }) {
  const counts = countStatuses(listings);
  const buckets = weekBuckets(listings);
  const streak = dayStreak(listings);
  const { total, appliedPlus, interviewPlus, offers } = counts;

  const grewThisWeek = total > 0 && buckets[WEEKS - 1] > buckets[WEEKS - 2];

  return (
    <Tile
      label="Headline metric"
      className="relative overflow-hidden p-7 sm:p-9 lg:col-span-3 lg:row-span-2"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_30%_0%,hsl(190_100%_42%/0.12)_0%,transparent_70%)]"
        aria-hidden="true"
      />
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <SectionLabel>Total tracked</SectionLabel>
          {grewThisWeek ? <Pill tone="success">▲ this wk</Pill> : null}
        </div>

        <p className="mt-8 font-mono text-6xl font-bold leading-none text-foreground-900 sm:text-7xl">
          {total}
        </p>
        <p className="mt-4 max-w-sm text-sm leading-relaxed">
          {total === 0
            ? "No roles in your pipeline yet — run your first research session to start filling the board."
            : `roles in your pipeline — ${appliedPlus} progressed past saved, ${offers} offer${offers === 1 ? "" : "s"} on the table.`}
        </p>

        <svg
          className="mt-8 h-24 w-full"
          viewBox="0 0 320 90"
          preserveAspectRatio="none"
          role="img"
          aria-label="Tracked roles trend, last 12 weeks"
        >
          <polyline
            points={sparkPoints(buckets)}
            fill="none"
            stroke="hsl(190 100% 42%)"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {total > 0 ? (
            <g fill="hsl(190 100% 42%)">
              <circle cx="320" cy="8" r="3.5" />
            </g>
          ) : null}
        </svg>

        <div className="mt-auto grid grid-cols-3 gap-3 border-t border-stroke pt-6">
          <div>
            <p className="font-mono text-xl font-bold text-foreground-900">
              {appsPerDay(listings)}
            </p>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground-600/60">
              Apps / day
            </p>
          </div>
          <div>
            <p className="font-mono text-xl font-bold text-foreground-900">
              {interviewPlus}
            </p>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground-600/60">
              In play
            </p>
          </div>
          <div>
            <p className="font-mono text-xl font-bold text-success">{streak}</p>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground-600/60">
              Day streak
            </p>
          </div>
        </div>
      </div>
    </Tile>
  );
}
