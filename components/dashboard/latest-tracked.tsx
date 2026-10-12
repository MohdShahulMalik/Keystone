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
    <Tile label="Top matches" className="p-6 lg:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>Latest tracked</Eyebrow>
        <Link
          href="/listings"
          className="font-mono text-[11px] text-accent underline-offset-4 hover:underline"
        >
          all
        </Link>
      </div>
      {latest.length === 0 ? (
        <p className="mt-5 text-sm leading-relaxed">
          Nothing tracked yet.{" "}
          <Link
            href="/research/job"
            className="text-accent underline-offset-4 hover:underline"
          >
            Run a research session
          </Link>{" "}
          to fill this board.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-stroke">
          {latest.map((job) => (
            <li
              key={job.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground-900">
                  {job.company}
                </p>
                <p className="truncate font-mono text-[11px] text-foreground-600/70">
                  {job.title}
                  {job.salary ? ` · ${job.salary}` : ""}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-foreground-600">
                <Dot color={STATUS_DOT[job.status] ?? "bg-foreground-600"} />
                {job.status.toLowerCase()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}
