import { countStatuses, pct, RING_C } from "@/lib/dashboard/metrics";
import type { JobListing } from "@/lib/types/jobs";
import { Dot, Pill, SectionLabel, Tile } from "./tile";

export function ConversionCard({ listings }: { listings: JobListing[] }) {
  const { total, appliedPlus, interviewPlus, offers } = countStatuses(listings);

  const savedToApplied = total === 0 ? 0 : appliedPlus / total;
  const appliedToInterview =
    appliedPlus === 0 ? 0 : interviewPlus / appliedPlus;
  const interviewToOffer = interviewPlus === 0 ? 0 : offers / interviewPlus;

  const seg1 = savedToApplied * RING_C;
  const seg2 = appliedToInterview * RING_C;
  const seg3 = interviewToOffer * RING_C;

  return (
    <Tile label="Conversion" className="p-7 lg:col-span-3">
      <div className="flex items-center justify-between gap-4">
        <SectionLabel>Conversion</SectionLabel>
        <Pill>all time</Pill>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-8">
        <div className="relative h-36 w-36 flex-none">
          <svg
            className="h-36 w-36 -rotate-90"
            viewBox="0 0 120 120"
            role="img"
            aria-label={`Donut chart: ${pct(appliedPlus, total)} applied, ${pct(interviewPlus, appliedPlus)} interview, ${pct(offers, interviewPlus)} offer rate`}
          >
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke="hsl(195 100% 12%)"
              strokeWidth="12"
            />
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke="hsl(217 100% 70%)"
              strokeWidth="12"
              strokeDasharray={`${seg1} ${RING_C}`}
              strokeLinecap="butt"
            />
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke="hsl(190 100% 42%)"
              strokeWidth="12"
              strokeDasharray={`${seg2} ${RING_C}`}
              strokeDashoffset={-seg1}
              strokeLinecap="butt"
            />
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke="hsl(162 100% 42%)"
              strokeWidth="12"
              strokeDasharray={`${seg3} ${RING_C}`}
              strokeDashoffset={-(seg1 + seg2)}
              strokeLinecap="butt"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="font-mono text-2xl font-bold text-foreground-900">
              {pct(appliedPlus, total)}
            </p>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground-600/60">
              applied
            </p>
          </div>
        </div>

        <ul className="min-w-0 flex-1 space-y-3">
          <li className="flex items-center justify-between gap-4 border-b border-stroke pb-3">
            <span className="flex items-center gap-2.5 text-sm text-foreground-900">
              <Dot color="bg-info" />
              Saved → Applied
            </span>
            <span className="font-mono text-sm text-foreground-900">
              {pct(appliedPlus, total)}
            </span>
          </li>
          <li className="flex items-center justify-between gap-4 border-b border-stroke pb-3">
            <span className="flex items-center gap-2.5 text-sm text-foreground-900">
              <Dot color="bg-accent" />
              Applied → Interview
            </span>
            <span className="font-mono text-sm text-foreground-900">
              {pct(interviewPlus, appliedPlus)}
            </span>
          </li>
          <li className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2.5 text-sm text-foreground-900">
              <Dot color="bg-success" />
              Interview → Offer
            </span>
            <span className="font-mono text-sm text-success">
              {pct(offers, interviewPlus)}
            </span>
          </li>
        </ul>
      </div>
    </Tile>
  );
}
