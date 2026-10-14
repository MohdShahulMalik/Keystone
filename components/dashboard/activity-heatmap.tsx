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
    <Tile
      label="Activity heatmap"
      className="min-w-0 overflow-hidden p-6 sm:col-span-2 lg:col-span-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow>Activity · last 12 weeks</Eyebrow>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-body/50">less</span>
          <span className="h-3 w-3 rounded bg-edge" aria-hidden="true" />
          <span
            className="h-3 w-3 rounded bg-[rgba(0,184,214,0.22)]"
            aria-hidden="true"
          />
          <span
            className="h-3 w-3 rounded bg-[rgba(0,184,214,0.45)]"
            aria-hidden="true"
          />
          <span
            className="h-3 w-3 rounded bg-[rgba(0,184,214,0.7)]"
            aria-hidden="true"
          />
          <span className="h-3 w-3 rounded bg-acc-cyan" aria-hidden="true" />
          <span className="font-mono text-[10px] text-body/50">more</span>
        </div>
      </div>

      <div
        className="mt-5 grid grid-cols-12 gap-1 sm:gap-1.5"
        role="img"
        aria-label="Heatmap of daily application activity over 12 weeks"
      >
        {cells.flat().map((cell) => (
          <div
            key={cell.id}
            className={`aspect-[2/1] w-full min-w-0 rounded-[3px] ${heatClass(cell.count)}`}
            title={cell.count > 0 ? `${cell.count} tracked` : undefined}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-edge pt-4">
        <p className="font-mono text-xs text-body/70">
          peak week{" "}
          <span className="ml-1 text-ice">
            {busiestWeekCounts(cells)} tracked
          </span>
        </p>
        <p className="font-mono text-xs text-body/70">
          busiest{" "}
          <span className="ml-1 text-ice">{busiestWeekday(cells) ?? "—"}</span>
        </p>
        <p className="font-mono text-xs text-body/70">
          current streak <span className="ml-1 text-ok">{streak} days</span>
        </p>
      </div>
    </Tile>
  );
}
