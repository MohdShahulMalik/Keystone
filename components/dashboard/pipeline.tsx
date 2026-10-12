import { countStatuses, funnelStages } from "@/lib/dashboard/metrics";
import type { JobListing } from "@/lib/types/jobs";
import { Eyebrow, Tile } from "./tile";

export function PipelineCard({ listings }: { listings: JobListing[] }) {
  const stages = funnelStages(countStatuses(listings));

  return (
    <Tile label="Pipeline stages" className="p-6 lg:col-span-2">
      <Eyebrow>Pipeline</Eyebrow>
      <ul className="mt-5 space-y-4">
        {stages.map((stage) => (
          <li key={stage.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-foreground-900">{stage.label}</span>
              <span className="font-mono text-sm text-foreground-900">
                {stage.count}
              </span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-surface-900">
              <div
                className={`h-full rounded-full ${stage.bar}`}
                style={{ width: `${Math.min(100, stage.width)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Tile>
  );
}
