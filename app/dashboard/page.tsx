import Link from "next/link";
import { getJobListings } from "@/app/actions/jobs";
import { ActivityHeatmapCard } from "@/components/dashboard/activity-heatmap";
import { AgentStatusCard } from "@/components/dashboard/agent-status";
import { ConversionCard } from "@/components/dashboard/conversion";
import { HeroMetricCard } from "@/components/dashboard/hero-metric";
import { LatestTrackedCard } from "@/components/dashboard/latest-tracked";
import { PipelineCard } from "@/components/dashboard/pipeline";
import { SalarySpreadCard } from "@/components/dashboard/salary-spread";
import { Pill } from "@/components/dashboard/tile";
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
    <div className="min-h-screen bg-surface-900 font-sans text-foreground-600">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div className="flex items-center gap-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10">
              <svg
                className="h-5 w-5 text-accent"
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
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground-600/60">
                Week {isoWeek(now)} · {month}
              </p>
              <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-foreground-900 sm:text-3xl">
                Hunt overview
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {running > 0 ? (
              <Pill tone="success" live>
                {running} agent{running === 1 ? "" : "s"} running
              </Pill>
            ) : (
              <Pill>no agents running</Pill>
            )}
            <Link
              href="/listings"
              className="rounded-xl border border-secondary bg-surface-800/60 px-4 py-2 font-mono text-xs uppercase tracking-wider text-foreground-900 transition-colors hover:border-accent hover:bg-accent/10"
            >
              View listings
            </Link>
            <Link
              href="/research/job"
              className="rounded-xl border border-accent bg-accent px-4 py-2 text-sm font-semibold text-surface-900 transition-colors hover:brightness-110"
            >
              New research
            </Link>
          </div>
        </header>

        <main className="mt-9 grid auto-rows-auto gap-5 lg:grid-cols-6">
          <HeroMetricCard listings={listings} />
          <ConversionCard listings={listings} />
          <PipelineCard listings={listings} />
          <ActivityHeatmapCard listings={listings} />
          <LatestTrackedCard listings={listings} />
          <SalarySpreadCard listings={listings} />
          <AgentStatusCard sessions={sessions} tracked={listings.length} />
        </main>

        <p className="mt-8 text-center font-mono text-[11px] text-foreground-600/45">
          Keystone · data refreshed just now
        </p>
      </div>
    </div>
  );
}
