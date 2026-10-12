import {
  busiestWeekCounts,
  busiestWeekday,
  dayStreak,
  heatCells,
  heatClass,
} from "@/lib/dashboard/metrics";
import type { JobListing } from "@/lib/types/jobs";
import { Eyebrow, Tile } from "./tile";

export function ActivityHeatmapCard({ listings }: { listings: JobListing[] }) {
  const cells = heatCells(listings);
  const streak = dayStreak(listings);

  return (
    <Tile label="Activity heatmap" className="p-6 lg:col-span-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow>Activity · last 12 weeks</Eyebrow>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-foreground-600/50">
            less
          </span>
          <span className="h-3 w-3 rounded bg-stroke" aria-hidden="true" />
          <span className="h-3 w-3 rounded bg-accent/20" aria-hidden="true" />
          <span className="h-3 w-3 rounded bg-accent/45" aria-hidden="true" />
          <span className="h-3 w-3 rounded bg-accent/70" aria-hidden="true" />
          <span className="h-3 w-3 rounded bg-accent" aria-hidden="true" />
          <span className="font-mono text-[10px] text-foreground-600/50">
            more
          </span>
        </div>
      </div>

      <div
        className="mt-5 grid grid-cols-12 gap-1.5"
        role="img"
        aria-label="Heatmap of daily application activity over 12 weeks"
      >
        {cells.flat().map((cell) => (
          <div
            key={cell.id}
            className={`aspect-[2/1] w-full rounded-[3px] ${heatClass(cell.count)}`}
            title={cell.count > 0 ? `${cell.count} tracked` : undefined}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-stroke pt-4">
        <p className="font-mono text-xs text-foreground-600/70">
          peak week{" "}
          <span className="ml-1 text-foreground-900">
            {busiestWeekCounts(cells)} tracked
          </span>
        </p>
        <p className="font-mono text-xs text-foreground-600/70">
          busiest{" "}
          <span className="ml-1 text-foreground-900">
            {busiestWeekday(cells) ?? "—"}
          </span>
        </p>
        <p className="font-mono text-xs text-foreground-600/70">
          current streak{" "}
          <span className="ml-1 text-success">{streak} days</span>
        </p>
      </div>
    </Tile>
  );
}
