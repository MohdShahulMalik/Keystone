import { formatComp, pct, salaryStats } from "@/lib/dashboard/metrics";
import type { JobListing } from "@/lib/types/jobs";
import { Eyebrow, Tile } from "./tile";

/**
 * Salary range card. The band spans 20%-82% of the track, and the marker sits
 * where the median falls between the lowest and highest tracked salary.
 */
export function SalarySpreadCard({ listings }: { listings: JobListing[] }) {
  const { entries, best, bestValue, median, min, max } = salaryStats(listings);
  const hasSpread =
    min !== null && max !== null && median !== null && max > min;
  const markerLeft = hasSpread
    ? 20 + ((median - min) / (max - min)) * 62
    : null;

  return (
    <Tile label="Salary spread" className="p-6 lg:col-span-2">
      <Eyebrow>Offer vs. market</Eyebrow>
      <p className="mt-4 font-mono text-3xl font-bold text-success">
        {bestValue === null ? "—" : formatComp(bestValue)}
      </p>
      <p className="mt-2 text-sm">
        {best ? `best tracked · ${best.company}` : "no salary data yet"}
      </p>

      <div className="mt-6">
        <div className="relative h-2 rounded-full bg-surface-900">
          <div className="absolute inset-y-0 left-[20%] right-[18%] rounded-full bg-accent/30" />
          {markerLeft !== null ? (
            <span
              className="absolute -top-1 h-4 w-1 rounded-full bg-success"
              style={{ left: `${markerLeft}%` }}
              aria-hidden="true"
            />
          ) : null}
        </div>
        <div className="mt-3 flex justify-between font-mono text-[10px] text-foreground-600/50">
          <span>{min === null ? "—" : formatComp(min)}</span>
          <span>median {median === null ? "—" : formatComp(median)}</span>
          <span>{max === null ? "—" : formatComp(max)}</span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 border-t border-stroke pt-5">
        <div>
          <p className="font-mono text-lg font-bold text-foreground-900">
            {entries.length}
          </p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground-600/60">
            With salary
          </p>
        </div>
        <div>
          <p className="font-mono text-lg font-bold text-foreground-900">
            {listings.length === 0 ? "—" : pct(entries.length, listings.length)}
          </p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground-600/60">
            Coverage
          </p>
        </div>
      </div>
    </Tile>
  );
}
