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
  const { total, appliedPlus, offers } = counts;

  const grewThisWeek = total > 0 && buckets[WEEKS - 1] > buckets[WEEKS - 2];

  // End-dot tracks the actual last bucket value (same math as sparkPoints
  // in lib/dashboard/metrics.ts), inset by its radius so it never clips
  // at the viewBox edge.
  const DOT_R = 3.5;
  const sparkMax = Math.max(1, ...buckets);
  const lastValue = buckets[buckets.length - 1] ?? 0;
  const dotCx = 320 - DOT_R - 1;
  const dotCy = Math.min(
    Math.max(82 - (lastValue / sparkMax) * 74, DOT_R + 1),
    90 - DOT_R - 1,
  );

  return (
    <Tile
      label="Headline metric"
      className="relative overflow-hidden p-6 sm:col-span-2 sm:p-9 lg:col-span-3 lg:row-span-2"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_30%_0%,rgba(0,184,214,0.12)_0%,transparent_70%)]"
        aria-hidden="true"
      />
      <div className="relative flex h-full min-w-0 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionLabel>Total tracked</SectionLabel>
          {grewThisWeek ? <Pill tone="success">▲ this wk</Pill> : null}
        </div>

        <p className="mt-8 break-words font-mono text-[clamp(2.75rem,12vw,4.5rem)] font-bold leading-none text-ice">
          {total}
        </p>
        <p className="mt-4 max-w-sm text-pretty text-sm leading-relaxed break-words text-body">
          {total === 0
            ? "No roles in your pipeline yet — run your first research session to start filling the board."
            : `roles in your pipeline — ${appliedPlus} progressed past saved, ${offers} offer${offers === 1 ? "" : "s"} on the table.`}
        </p>

        <svg
          className="mt-8 h-20 w-full min-w-0 max-w-full sm:h-24"
          viewBox="0 0 320 90"
          preserveAspectRatio="none"
          role="img"
          aria-label="Tracked roles trend, last 12 weeks"
        >
          <polyline
            points={sparkPoints(buckets)}
            fill="none"
            stroke="#00B8D6"
            strokeWidth="2.5"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {total > 0 ? (
            <g fill="#00B8D6">
              <circle cx={dotCx} cy={dotCy} r={DOT_R} />
            </g>
          ) : null}
        </svg>

        <div className="mt-8 grid grid-cols-3 gap-2 border-t border-edge pt-6 sm:gap-3 lg:mt-auto">
          <div className="min-w-0">
            <p className="font-mono text-xl font-bold text-ice">
              {appsPerDay(listings)}
            </p>
            <p className="mt-1 break-words font-mono text-[11px] uppercase leading-snug tracking-[0.14em] text-body/60">
              Apps / day
            </p>
          </div>
          <div className="min-w-0">
            <p className="font-mono text-xl font-bold text-ice">
              {counts.interviewPlus}
            </p>
            <p className="mt-1 break-words font-mono text-[11px] uppercase leading-snug tracking-[0.14em] text-body/60">
              In play
            </p>
          </div>
          <div className="min-w-0">
            <p className="font-mono text-xl font-bold text-ok">{streak}</p>
            <p className="mt-1 break-words font-mono text-[11px] uppercase leading-snug tracking-[0.14em] text-body/60">
              Day streak
            </p>
          </div>
        </div>
      </div>
    </Tile>
  );
}
