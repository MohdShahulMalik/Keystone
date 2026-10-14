import Link from "next/link";
import { getJobListings } from "@/app/actions/jobs";
import { ActivityHeatmapCard } from "@/components/dashboard/activity-heatmap";
import { AgentStatusCard } from "@/components/dashboard/agent-status";
import { ConversionCard } from "@/components/dashboard/conversion";
import { HeroMetricCard } from "@/components/dashboard/hero-metric";
import { LatestTrackedCard } from "@/components/dashboard/latest-tracked";
import { PipelineCard } from "@/components/dashboard/pipeline";
import { SalarySpreadCard } from "@/components/dashboard/salary-spread";
import { LiveDot, Pill } from "@/components/dashboard/tile";
import { type DashboardSession, isoWeek } from "@/lib/dashboard/metrics";
import { db } from "@/lib/db";

export const metadata = {
  title: "Dashboard · Keystone",
  description: "Hunt overview — pipeline, conversion, activity and agents.",
};

const USER_ID = "maxum";

async function getRecentSessions(): Promise<DashboardSession[]> {
  try {
    const rows = await db.searchSession.findMany({
      where: { userId: USER_ID },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        resultCount: true,
        createdAt: true,
        _count: { select: { children: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: String(r.status),
      resultCount: r.resultCount,
      createdAt: r.createdAt,
      subagents: r._count.children,
    }));
  } catch (error) {
    console.error("[dashboard] getRecentSessions failed:", error);
    return [];
  }
}

export default async function DashboardPage() {
  const [listings, sessions] = await Promise.all([
    getJobListings(USER_ID),
    getRecentSessions(),
  ]);

  const now = new Date();
  const running = sessions.filter((s) => s.status === "running").length;
  const month = now.toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });

  return (
    <div className="min-h-screen overflow-x-clip bg-ink font-display text-body antialiased selection:bg-[rgba(0,184,214,0.3)] selection:text-[#EAFBFF]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-12">
        <header className="flex flex-wrap items-end justify-between gap-x-5 gap-y-4">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl border border-acc-cyan/30 bg-acc-cyan/10">
              <svg
                className="h-5 w-5 max-w-full text-acc-cyan"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                role="img"
                aria-label="Keystone"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase leading-[1.4] tracking-[0.14em] text-body/60">
                Week {isoWeek(now)} · {month}
              </p>
              <h1 className="mt-1.5 text-balance break-words text-2xl font-bold tracking-tight text-ice sm:text-3xl">
                Hunt overview
              </h1>
            </div>
          </div>

          <div className="flex w-full min-w-0 max-w-full flex-wrap items-center gap-2 sm:w-auto">
            {running > 0 ? (
              <span className="inline-flex max-w-full shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-ok/30 bg-[rgba(2,11,20,0.75)] px-[0.6rem] py-[0.3rem] font-mono text-[11px] uppercase tracking-[0.08em] text-ok">
                <LiveDot />
                {running} agent{running === 1 ? "" : "s"} running
              </span>
            ) : (
              <Pill>no agents running</Pill>
            )}
            <Link
              href="/listings"
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-[#00394C] bg-[rgba(3,16,25,0.6)] px-3 py-2 font-mono text-xs uppercase tracking-wider text-ice transition-colors duration-200 hover:border-acc-cyan hover:bg-[rgba(0,184,214,0.08)] focus-visible:rounded-xl focus-visible:outline-2 focus-visible:outline-acc-cyan focus-visible:outline-offset-2 sm:px-4"
            >
              View listings
            </Link>
            <Link
              href="/research/job"
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-acc-cyan bg-acc-cyan px-3 py-2 text-sm font-semibold text-[#02131C] transition-colors duration-200 hover:border-[#33C7DE] hover:bg-[#33C7DE] focus-visible:rounded-xl focus-visible:outline-2 focus-visible:outline-acc-cyan focus-visible:outline-offset-2 sm:px-4"
            >
              New research
            </Link>
          </div>
        </header>

        <main className="mt-9 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-6 [&>section]:min-w-0">
          <HeroMetricCard listings={listings} />
          <ConversionCard listings={listings} />
          <PipelineCard listings={listings} />
          <ActivityHeatmapCard listings={listings} />
          <LatestTrackedCard listings={listings} />
          <SalarySpreadCard listings={listings} />
          <AgentStatusCard sessions={sessions} tracked={listings.length} />
        </main>

        <p className="mt-8 text-center font-mono text-[11px] leading-[1.4] text-body/45">
          Keystone · data refreshed just now
        </p>
      </div>
    </div>
  );
}
