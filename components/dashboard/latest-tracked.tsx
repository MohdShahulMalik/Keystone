import Link from "next/link";
import { STATUS_DOT } from "@/lib/dashboard/metrics";
import type { JobListing } from "@/lib/types/jobs";
import { Dot, Eyebrow, Tile } from "./tile";

export function LatestTrackedCard({ listings }: { listings: JobListing[] }) {
  const latest = [...listings]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 4);

  return (
    <Tile
      label="Top matches"
      className="min-w-0 overflow-hidden p-6 lg:col-span-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow>Latest tracked</Eyebrow>
        <Link
          href="/listings"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center font-mono text-[11px] text-acc-cyan underline-offset-4 hover:underline focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-acc-cyan focus-visible:outline-offset-2"
        >
          all
        </Link>
      </div>
      {latest.length === 0 ? (
        <p className="mt-5 text-sm leading-relaxed text-body">
          Nothing tracked yet.{" "}
          <Link
            href="/research/job"
            className="text-acc-cyan underline-offset-4 hover:underline focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-acc-cyan focus-visible:outline-offset-2"
          >
            Run a research session
          </Link>{" "}
          to fill this board.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-edge">
          {latest.map((job) => (
            <li
              key={job.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ice">
                  {job.company}
                </p>
                <p className="truncate font-mono text-[11px] text-body/70">
                  {job.title}
                  {job.salary ? ` · ${job.salary}` : ""}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-body">
                <Dot color={STATUS_DOT[job.status] ?? "bg-body"} />
                {job.status.toLowerCase()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}
