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
    <Tile
      label="Conversion"
      className="min-w-0 overflow-hidden p-6 sm:col-span-2 sm:p-7 lg:col-span-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionLabel>Conversion</SectionLabel>
        <Pill>all time</Pill>
      </div>

      <div className="mt-6 flex min-w-0 flex-col items-stretch gap-6 sm:flex-row sm:items-center sm:gap-8">
        <div className="relative mx-auto h-36 w-36 flex-none sm:mx-0">
          <svg
            className="h-36 w-36 max-w-full -rotate-90"
            viewBox="0 0 120 120"
            role="img"
            aria-label={`Donut chart: ${pct(appliedPlus, total)} applied, ${pct(interviewPlus, appliedPlus)} interview, ${pct(offers, interviewPlus)} offer rate`}
          >
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke="#00212E"
              strokeWidth="12"
            />
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke="#38BDF8"
              strokeWidth="12"
              strokeDasharray={`${seg1} ${RING_C}`}
              strokeLinecap="butt"
            />
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke="#00B8D6"
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
              stroke="#10D9A0"
              strokeWidth="12"
              strokeDasharray={`${seg3} ${RING_C}`}
              strokeDashoffset={-(seg1 + seg2)}
              strokeLinecap="butt"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="font-mono text-2xl font-bold text-ice">
              {pct(appliedPlus, total)}
            </p>
            <p className="mt-1 font-mono text-[11px] uppercase leading-[1.4] tracking-[0.14em] text-body/60">
              applied
            </p>
          </div>
        </div>

        <ul className="w-full min-w-0 flex-1 space-y-3">
          <li className="flex min-w-0 items-center justify-between gap-4 border-b border-edge pb-3">
            <span className="flex min-w-0 items-center gap-2.5 text-sm text-ice">
              <Dot color="bg-info" />
              <span className="min-w-0 break-words">Saved → Applied</span>
            </span>
            <span className="flex-none font-mono text-sm text-ice">
              {pct(appliedPlus, total)}
            </span>
          </li>
          <li className="flex min-w-0 items-center justify-between gap-4 border-b border-edge pb-3">
            <span className="flex min-w-0 items-center gap-2.5 text-sm text-ice">
              <Dot color="bg-acc-cyan" />
              <span className="min-w-0 break-words">Applied → Interview</span>
            </span>
            <span className="flex-none font-mono text-sm text-ice">
              {pct(interviewPlus, appliedPlus)}
            </span>
          </li>
          <li className="flex min-w-0 items-center justify-between gap-4">
            <span className="flex min-w-0 items-center gap-2.5 text-sm text-ice">
              <Dot color="bg-ok" />
              <span className="min-w-0 break-words">Interview → Offer</span>
            </span>
            <span className="flex-none font-mono text-sm text-ok">
              {pct(offers, interviewPlus)}
            </span>
          </li>
        </ul>
      </div>
    </Tile>
  );
}
