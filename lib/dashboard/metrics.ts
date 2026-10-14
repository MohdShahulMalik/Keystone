import type { JobListing } from "@/lib/types/jobs";
import type { JobStatus } from "@/lib/types/status";

export const WEEKS = 12;
/** Circumference of the donut ring (r=50) used for stroke-dasharray math. */
export const RING_C = 2 * Math.PI * 50;

export interface DashboardSession {
  id: string;
  title: string | null;
  status: string;
  resultCount: number;
  createdAt: Date;
  subagents: number;
}

export interface StatusCounts {
  total: number;
  saved: number;
  applied: number;
  interviews: number;
  offers: number;
  /** Applied + Interview + Offer */
  appliedPlus: number;
  /** Interview + Offer */
  interviewPlus: number;
}

/** Bucketed status totals — the shared source for hero, conversion and pipeline cards. */
export function countStatuses(listings: JobListing[]): StatusCounts {
  const saved = listings.filter((l) => l.status === "OPEN").length;
  const applied = listings.filter((l) => l.status === "APPLIED").length;
  const interviews = listings.filter((l) => l.status === "INTERVIEW").length;
  const offers = listings.filter((l) => l.status === "OFFER").length;

  return {
    total: listings.length,
    saved,
    applied,
    interviews,
    offers,
    appliedPlus: applied + interviews + offers,
    interviewPlus: interviews + offers,
  };
}

export function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function relativeTime(d: Date): string {
  const mins = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export function isoWeek(d: Date): number {
  const c = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (c.getUTCDay() + 6) % 7;
  c.setUTCDate(c.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(c.getUTCFullYear(), 0, 4));
  const fday = (first.getUTCDay() + 6) % 7;
  first.setUTCDate(first.getUTCDate() - fday + 3);
  return 1 + Math.round((c.getTime() - first.getTime()) / (7 * 86400000));
}

/** Listings created per ISO week, oldest bucket first, newest last. */
export function weekBuckets(
  listings: JobListing[],
  weeks: number = WEEKS,
): number[] {
  const buckets = new Array<number>(weeks).fill(0);
  const now = Date.now();
  for (const l of listings) {
    const weeksAgo = Math.floor(
      (now - new Date(l.createdAt).getTime()) / (7 * 86400000),
    );
    if (weeksAgo >= 0 && weeksAgo < weeks) buckets[weeks - 1 - weeksAgo] += 1;
  }
  return buckets;
}

/** Normalises weekly buckets into a `320×90` SVG polyline (highest value near the top). */
export function sparkPoints(buckets: number[]): string {
  const max = Math.max(1, ...buckets);
  return buckets
    .map((v, i) => {
      const x = (i / (buckets.length - 1)) * 320;
      const y = 82 - (v / max) * 74;
      return `${x.toFixed(0)},${y.toFixed(0)}`;
    })
    .join(" ");
}

export interface HeatCell {
  id: string;
  count: number;
}

/** 7 rows (weekday) × N weeks, newest column last, as stable-id cells. */
export function heatCells(
  listings: JobListing[],
  weeks: number = WEEKS,
): HeatCell[][] {
  const grid = Array.from({ length: 7 }, () =>
    new Array<number>(weeks).fill(0),
  );
  const today = startOfDay(new Date());
  for (const l of listings) {
    const day = startOfDay(new Date(l.createdAt));
    const daysAgo = Math.round((today.getTime() - day.getTime()) / 86400000);
    if (daysAgo < 0 || daysAgo >= 7 * weeks) continue;
    const col = weeks - 1 - Math.floor(daysAgo / 7);
    grid[day.getDay()][col] += 1;
  }
  return grid.map((row, r) =>
    row.map((count, c) => ({ id: `d${r}w${c}`, count })),
  );
}

/** Bucket colour intensity, matching the template's 5-step hm scale. */
export function heatClass(count: number): string {
  if (count >= 5) return "bg-acc-cyan";
  if (count >= 3) return "bg-[rgba(0,184,214,0.7)]";
  if (count === 2) return "bg-[rgba(0,184,214,0.45)]";
  if (count === 1) return "bg-[rgba(0,184,214,0.22)]";
  return "bg-edge";
}

export function busiestWeekCounts(cells: HeatCell[][]): number {
  return cells.reduce(
    (max, row) => Math.max(max, ...row.map((cell) => cell.count)),
    0,
  );
}

export function busiestWeekday(cells: HeatCell[][]): string | null {
  const names = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  let bestDay = -1;
  let bestCount = 0;
  cells.forEach((row, d) => {
    const count = row.reduce((sum, cell) => sum + cell.count, 0);
    if (count > bestCount) {
      bestCount = count;
      bestDay = d;
    }
  });
  return bestDay === -1 ? null : names[bestDay];
}

/** Consecutive days with a tracked listing, counting back from today (or yesterday). */
export function dayStreak(listings: JobListing[]): number {
  const days = new Set(listings.map((l) => dayKey(new Date(l.createdAt))));
  let streak = 0;
  const cursor = startOfDay(new Date());
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Highest number found in a free-text salary ("$180k-$220k" → 220000). */
export function parseSalaryMax(raw: string | null): number | null {
  if (!raw) return null;
  const re = /\$?\s*([\d.,]+)\s*([kKmM])?/g;
  let best: number | null = null;
  for (const m of raw.matchAll(re)) {
    const num = Number.parseFloat(m[1].replace(/,/g, ""));
    if (Number.isNaN(num)) continue;
    const suffix = m[2]?.toLowerCase();
    const value =
      suffix === "m" ? num * 1_000_000 : suffix === "k" ? num * 1000 : num;
    if (value < 1000) continue;
    best = best === null ? value : Math.max(best, value);
  }
  return best;
}

export function formatComp(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `$${Number.isInteger(m) ? m : m.toFixed(1)}m`;
  }
  const k = value / 1000;
  return `$${Number.isInteger(k) ? k : k.toFixed(1)}k`;
}

/** Formatted percentage; `—` when the denominator is zero. */
export function pct(n: number, d: number): string {
  if (d === 0) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

export interface CompEntry {
  listing: JobListing;
  value: number;
}

export interface SalaryStats {
  /** Listings with a parseable salary, highest first. */
  entries: CompEntry[];
  best: JobListing | null;
  bestValue: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
}

export function salaryStats(listings: JobListing[]): SalaryStats {
  const entries = listings
    .map((l) => ({ listing: l, value: parseSalaryMax(l.salary) }))
    .filter((c): c is CompEntry => c.value !== null)
    .sort((a, b) => b.value - a.value);

  if (entries.length === 0) {
    return {
      entries,
      best: null,
      bestValue: null,
      median: null,
      min: null,
      max: null,
    };
  }

  return {
    entries,
    best: entries[0].listing,
    bestValue: entries[0].value,
    median: entries[Math.floor(entries.length / 2)].value,
    min: entries[entries.length - 1].value,
    max: entries[0].value,
  };
}

/** Average listings per day across the newest listing, for the hero card. */
export function appsPerDay(
  listings: JobListing[],
  now: Date = new Date(),
): string {
  if (listings.length === 0) return "0.0";
  const oldest = listings.reduce((a, b) =>
    new Date(a.createdAt) < new Date(b.createdAt) ? a : b,
  ).createdAt;
  const spanDays = Math.max(
    1,
    Math.round((now.getTime() - new Date(oldest).getTime()) / 86400000) + 1,
  );
  return (listings.length / spanDays).toFixed(1);
}

export interface FunnelStage {
  label: string;
  count: number;
  bar: string;
  width: number;
}

/** Funnel bars as a percentage of every tracked listing (the "Saved" stage). */
export function funnelStages(counts: StatusCounts): FunnelStage[] {
  const { total, saved, appliedPlus, interviewPlus, offers } = counts;
  const share = (n: number) => (total === 0 ? 0 : (n / total) * 100);

  return [
    {
      label: "Saved",
      count: saved || total,
      bar: "bg-body/60",
      width: 100,
    },
    {
      label: "Applied",
      count: appliedPlus,
      bar: "bg-info",
      width: share(appliedPlus),
    },
    {
      label: "Interview",
      count: interviewPlus,
      bar: "bg-acc-cyan",
      width: share(interviewPlus),
    },
    { label: "Offer", count: offers, bar: "bg-ok", width: share(offers) },
  ];
}

export const STATUS_DOT: Record<JobStatus, string> = {
  OPEN: "bg-body",
  APPLIED: "bg-info",
  INTERVIEW: "bg-acc-cyan",
  OFFER: "bg-ok",
  REJECTED: "bg-danger",
  DECLINED: "bg-warning",
};

/** Progress of a research session, used by the agent card's progress bars. */
export function sessionProgress(status: string): {
  percent: number;
  bar: string;
} {
  if (status === "completed") return { percent: 100, bar: "bg-ok" };
  if (status === "failed") return { percent: 4, bar: "bg-danger" };
  return { percent: 50, bar: "bg-acc-cyan" };
}
