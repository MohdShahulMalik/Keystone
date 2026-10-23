import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import logo from "@/app/logo.png";

export const metadata = {
  title: "Keystone · Track. Discover. Ace.",
  description:
    "Keystone is an AI-powered career companion: track job applications, auto-discover relevant jobs with AI agents, and prep for interviews.",
};

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-acc-cyan focus-visible:outline-offset-2";

/* Ports `.section-label` (landing variant: no dash) to Tailwind. */
function SectionLabelText({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-3 font-display text-[13px] font-semibold uppercase leading-none tracking-[0.12em] text-acc-cyan">
      {children}
    </p>
  );
}

/* Ports `.eyebrow` to Tailwind. */
function EyebrowText({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`font-mono text-[11px] uppercase leading-[1.4] tracking-[0.14em] ${className}`}
    >
      {children}
    </p>
  );
}

/* Ports `.pill` + `.dot` to Tailwind. */
function PillSpan({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "ok" | "accent" | "accent-strong";
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg border bg-[rgba(2,11,20,0.75)] px-[0.6rem] py-[0.3rem] font-mono text-[11px] uppercase tracking-[0.08em] ${
        tone === "ok"
          ? "border-ok/30 text-ok"
          : tone === "accent"
            ? "border-acc-cyan/30 text-acc-cyan"
            : tone === "accent-strong"
              ? "border-acc-cyan/40 text-acc-cyan"
              : "border-edge text-body"
      }`}
    >
      {children}
    </span>
  );
}

function DotSpan({ color }: { color: string }) {
  return (
    <span
      className={`h-1.5 w-1.5 flex-none rounded-full ${color}`}
      aria-hidden="true"
    />
  );
}

/* Ports `.btn-primary` (landing variant: white text) to Tailwind. */
function PrimaryLink({
  href,
  className = "",
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`border border-acc-cyan bg-acc-cyan text-white transition-colors duration-200 hover:border-[#33C7DE] hover:bg-[#33C7DE] ${FOCUS} ${className}`}
    >
      {children}
    </Link>
  );
}

/* Ports `.btn-secondary` to Tailwind. */
function SecondaryLink({
  href,
  className = "",
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`border border-[#00394C] bg-[rgba(3,16,25,0.6)] text-ice transition-colors duration-200 hover:border-acc-cyan hover:bg-[rgba(0,184,214,0.08)] ${FOCUS} ${className}`}
    >
      {children}
    </Link>
  );
}

/* Ports `.card` + `.card-hover` to Tailwind. */
function Card({
  className = "",
  children,
  label,
}: {
  className?: string;
  children: ReactNode;
  label?: string;
}) {
  if (label) {
    return (
      <section
        aria-label={label}
        className={`rounded-[20px] border border-edge bg-card transition-colors duration-[250ms] hover:border-[rgba(0,184,214,0.5)] ${className}`}
      >
        {children}
      </section>
    );
  }
  return (
    <div
      className={`rounded-[20px] border border-edge bg-card transition-colors duration-[250ms] hover:border-[rgba(0,184,214,0.5)] ${className}`}
    >
      {children}
    </div>
  );
}

function WindowChrome({ address }: { address: string }) {
  return (
    <div className="flex items-center gap-4 border-b border-edge px-5 py-3">
      <span className="flex flex-none gap-1.5" aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-body/40" />
        <span className="h-2.5 w-2.5 rounded-full bg-ok/70" />
      </span>
      <span className="min-w-0 flex-1 truncate rounded-md border border-edge bg-ink/60 px-3 py-1 text-center font-mono text-[11px] text-body/70">
        {address}
      </span>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-clip bg-ink font-display text-body antialiased selection:bg-[rgba(0,184,214,0.3)] selection:text-[#EAFBFF]">
      {/* ============ NAV ============ */}
      <header className="sticky top-0 z-50 border-b border-edge/90 bg-ink/70 backdrop-blur-xl">
        <nav
          className="mx-auto flex h-16 max-w-6xl items-center justify-between px-8 sm:px-10 xl:px-6"
          aria-label="Main"
        >
          <a href="#top" className={`flex items-center gap-3 ${FOCUS}`}>
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden">
              <Image
                src={logo}
                alt="Keystone logo"
                className="h-full w-full object-contain"
              />
            </span>
            <span className="text-lg font-semibold tracking-tight text-ice">
              Keystone
            </span>
          </a>

          <div className="hidden items-center gap-8 md:flex">
            <a
              href="#live-response"
              className={`text-sm text-body transition-colors hover:text-ice ${FOCUS}`}
            >
              Preview
            </a>
            <a
              href="#features"
              className={`text-sm text-body transition-colors hover:text-ice ${FOCUS}`}
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className={`text-sm text-body transition-colors hover:text-ice ${FOCUS}`}
            >
              How it works
            </a>
            <a
              href="#get-started"
              className={`text-sm text-body transition-colors hover:text-ice ${FOCUS}`}
            >
              Why Keystone
            </a>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className={`hidden rounded-lg px-3 py-2 text-sm text-body transition-colors hover:bg-acc-cyan/10 hover:text-ice sm:block ${FOCUS}`}
            >
              Log In
            </Link>
            <PrimaryLink
              href="/signup"
              className="rounded-lg px-4 py-2 text-sm font-semibold"
            >
              Get started
            </PrimaryLink>
          </div>
        </nav>
      </header>

      <main id="top">
        {/* ============ HERO ============ */}
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_45%_at_50%_0%,rgba(0,184,214,0.1)_0%,transparent_70%)]"
            aria-hidden="true"
          />

          <div className="relative mx-auto max-w-6xl px-8 pb-24 pt-16 sm:px-10 sm:pb-32 sm:pt-24 xl:px-6">
            <div className="mx-auto max-w-5xl text-center">
              <h1 className="text-balance text-3xl font-normal leading-tight tracking-tight text-ice sm:text-4xl xl:whitespace-nowrap xl:text-[2.75rem]">
                Track applications. Discover jobs. Ace interviews.
              </h1>

              <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-body sm:text-lg">
                Keystone watches job boards with AI agents, removes duplicates,
                and tracks your pipeline from Open to Offer, all in one
                dashboard.
              </p>
            </div>

            <div className="mt-14 grid items-start gap-10 lg:grid-cols-2 lg:gap-12">
              <div>
                <p className="text-lg font-semibold text-ice">
                  From scattered tabs to one pipeline:
                </p>
                <ol className="mt-5 space-y-4 text-sm leading-relaxed text-body">
                  <li className="flex gap-3">
                    <span
                      className="font-mono text-[13px] font-bold text-acc-cyan"
                      aria-hidden="true"
                    >
                      1.
                    </span>
                    <span>
                      On Keystone, upload a{" "}
                      <strong className="font-semibold text-ice">
                        resume PDF
                      </strong>{" "}
                      to build your match profile.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span
                      className="font-mono text-[13px] font-bold text-acc-cyan"
                      aria-hidden="true"
                    >
                      2.
                    </span>
                    <span>
                      Start research with your{" "}
                      <strong className="font-semibold text-ice">
                        roles, countries and skills
                      </strong>
                      , agents verify and dedupe every listing.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span
                      className="font-mono text-[13px] font-bold text-acc-cyan"
                      aria-hidden="true"
                    >
                      3.
                    </span>
                    <span>
                      When new matches stream in,{" "}
                      <strong className="font-semibold text-ice">
                        apply and track
                      </strong>{" "}
                      them from Open to Offer.
                    </span>
                  </li>
                </ol>

                <p className="mt-6 text-sm text-body">
                  Free while self-hosted.{" "}
                  <span className="font-medium text-ice">
                    No credit card required.
                  </span>
                </p>

                <div className="mt-6 flex flex-wrap items-center gap-x-7 gap-y-4">
                  <PrimaryLink
                    href="/signup"
                    className="rounded-xl px-6 py-3 text-sm font-semibold"
                  >
                    Start tracking free
                  </PrimaryLink>
                  <a
                    href="#how-it-works"
                    className={`text-sm font-semibold text-ice underline decoration-acc-cyan/50 underline-offset-8 hover:decoration-acc-cyan ${FOCUS}`}
                  >
                    See how it works
                  </a>
                </div>
              </div>

              <aside
                className="rounded-[20px] border border-edge bg-card p-6 sm:p-7"
                aria-label="Pipeline dashboard preview"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <SectionLabelText>Pipeline</SectionLabelText>
                  <p className="font-mono text-xs text-body/70">this week</p>
                </div>
                <ul className="mt-6 space-y-5">
                  <li>
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-sm font-medium text-ice">Open</span>
                      <span className="font-mono text-sm text-ice">34</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-ink">
                      <div
                        className="h-full rounded-full bg-body/60"
                        style={{ width: "85%" }}
                      />
                    </div>
                  </li>
                  <li>
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-sm font-medium text-ice">
                        Applied
                      </span>
                      <span className="font-mono text-sm text-ice">12</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-ink">
                      <div
                        className="h-full rounded-full bg-info"
                        style={{ width: "42%" }}
                      />
                    </div>
                  </li>
                  <li>
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-sm font-medium text-ice">
                        Interview
                      </span>
                      <span className="font-mono text-sm text-ice">4</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-ink">
                      <div
                        className="h-full rounded-full bg-acc-cyan"
                        style={{ width: "22%" }}
                      />
                    </div>
                  </li>
                  <li>
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-sm font-medium text-ice">
                        Offer
                      </span>
                      <span className="font-mono text-sm text-ok">1</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-ink">
                      <div
                        className="h-full rounded-full bg-ok"
                        style={{ width: "10%" }}
                      />
                    </div>
                  </li>
                </ul>
              </aside>
            </div>
          </div>
        </section>

        {/* ============ LIVE AI RESPONSE ============ */}
        <section
          id="live-response"
          className="relative z-10 mx-auto max-w-6xl scroll-mt-20 px-8 sm:px-10 xl:px-6"
          aria-label="AI research response preview"
        >
          <div className="mx-auto -mt-20 max-w-5xl overflow-hidden rounded-[20px] border border-edge bg-card sm:-mt-28">
            <WindowChrome address="keystone.local/research · session 042" />

            <section
              className="p-6 sm:p-8"
              aria-label="Live AI research response preview"
            >
              <div className="flex items-center justify-end gap-4">
                <PillSpan tone="ok">
                  <DotSpan color="bg-ok" />
                  Running
                </PillSpan>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <h2 className="min-w-0 flex-1 truncate text-base font-bold text-ice">
                  React jobs · EU remote
                </h2>
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-body/60">
                  session 042
                </span>
              </div>

              <div className="mt-4 flex justify-end">
                <div className="max-w-[85%] rounded-xl rounded-br-sm border border-edge bg-ink/60 p-3 font-mono text-xs leading-relaxed text-body">
                  <span className="block">
                    <span className="text-ice">Roles:</span> Frontend, React
                  </span>
                  <span className="block">
                    <span className="text-ice">Countries:</span> EU remote
                  </span>
                  <span className="block">
                    <span className="text-ice">Skills:</span> React, TypeScript
                  </span>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="rounded-r-lg border-l-2 border-info/40 bg-ink/60 px-3 py-2 text-xs italic leading-relaxed text-body">
                  <span className="font-semibold not-italic text-info">
                    Thinking:
                  </span>{" "}
                  splitting React × EU-remote into 2 slices — one subagent per
                  slice, verifying each posting live…
                </div>
                <div className="rounded-r-md border-l-2 border-ok/50 bg-ink/60 px-3 py-1.5 font-mono text-xs text-body/80">
                  ✓ Webfetch https://boards.greenhouse.io (4s)
                </div>
                <div className="rounded-r-md border-l-2 border-ok/50 bg-ink/60 px-3 py-1.5 font-mono text-xs leading-relaxed text-body/80">
                  ✓{" "}
                  <Link
                    href="/research/job"
                    className={`cursor-pointer text-acc-cyan underline decoration-acc-cyan/40 underline-offset-4 hover:decoration-acc-cyan ${FOCUS}`}
                  >
                    General Task - React jobs in Germany
                  </Link>
                  <span className="block pl-4 text-body/60">
                    ↳ 5 tools · 1m 04s
                  </span>
                </div>
                <div className="rounded-r-md border-l-2 border-acc-cyan/60 bg-ink/60 px-3 py-1.5 font-mono text-xs leading-relaxed text-body/80">
                  ∴{" "}
                  <Link
                    href="/research/job"
                    className={`cursor-pointer text-acc-cyan underline decoration-acc-cyan/40 underline-offset-4 hover:decoration-acc-cyan ${FOCUS}`}
                  >
                    General Task - React jobs in Netherlands
                  </Link>
                  <span className="block pl-4 text-body/60">
                    ↳ Websearch Senior React remote EU
                  </span>
                </div>
                <div className="text-sm leading-relaxed text-body">
                  Found{" "}
                  <strong className="font-semibold text-ice">
                    30 verified roles
                  </strong>{" "}
                  across 2 slices — see{" "}
                  <Link
                    href="/research/job"
                    className={`font-medium text-acc-cyan underline decoration-acc-cyan/40 underline-offset-4 hover:decoration-acc-cyan ${FOCUS}`}
                  >
                    General Task - React jobs in Germany
                  </Link>{" "}
                  and 1 more. Deduped 11 cross-posts, verified 27 companies.
                </div>
              </div>

              <div className="mt-5 border-t border-edge pt-4">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <h3 className="min-w-0 text-sm font-semibold text-ice">
                    Matched jobs{" "}
                    <span className="ml-2 rounded-full border border-edge bg-ink/60 px-2.5 py-0.5 font-mono text-[11px] font-medium text-body">
                      30 · streaming…
                    </span>
                  </h3>
                  <Link
                    href="/listings"
                    className={`shrink-0 font-mono text-xs font-medium text-acc-cyan underline-offset-4 hover:underline ${FOCUS}`}
                  >
                    Show all (30)
                  </Link>
                </div>

                <div className="mt-4 grid min-w-0 items-start gap-4 lg:grid-cols-2">
                  <article className="min-w-0 overflow-hidden rounded-2xl border border-edge bg-ink/60 p-5">
                    <p className="text-base font-bold text-ice">Vercel</p>
                    <p className="mt-0.5 text-sm font-semibold text-acc-cyan">
                      Senior Frontend Engineer, React Core
                    </p>
                    <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-body">
                      <span className="text-ice">$165k – $210k</span>
                      <span aria-hidden="true" className="text-body/40">
                        •
                      </span>
                      <span>4+ yrs experience</span>
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <PillSpan>
                        <DotSpan color="bg-info" />
                        Remote · EU
                      </PillSpan>
                      <PillSpan>
                        <DotSpan color="bg-ok" />
                        Visa sponsored
                      </PillSpan>
                      <PillSpan>
                        <DotSpan color="bg-acc-cyan" />
                        Open
                      </PillSpan>
                    </div>
                    <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-body">
                      You&rsquo;ll own rendering primitives in the React core
                      team — shipping streaming SSR improvements, profiling
                      hydration cost, and collaborating with the framework team
                      on cache invalidation semantics&hellip;
                    </p>
                    <button
                      type="button"
                      className={`mt-1.5 text-[13px] font-medium text-acc-cyan underline-offset-4 hover:underline ${FOCUS}`}
                    >
                      Show more
                    </button>
                    <div className="mt-4 flex items-center justify-between gap-4">
                      <PrimaryLink
                        href="/listings"
                        className="rounded-xl px-5 py-2.5 text-sm font-semibold"
                      >
                        Apply Now
                      </PrimaryLink>
                      <EyebrowText className="text-body/60">
                        Found 2h ago
                      </EyebrowText>
                    </div>
                  </article>

                  <article className="min-w-0 overflow-hidden rounded-2xl border border-edge bg-ink/60 p-5">
                    <p className="text-base font-bold text-ice">Linear</p>
                    <p className="mt-0.5 text-sm font-semibold text-acc-cyan">
                      Product Engineer, Editor
                    </p>
                    <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-body">
                      <span className="text-ice">$150k – $185k</span>
                      <span aria-hidden="true" className="text-body/40">
                        •
                      </span>
                      <span>3+ yrs experience</span>
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <PillSpan>
                        <DotSpan color="bg-info" />
                        Remote · EU
                      </PillSpan>
                      <PillSpan>
                        <DotSpan color="bg-acc-cyan" />
                        Open
                      </PillSpan>
                    </div>
                    <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-body">
                      You&rsquo;ll build the real-time editor surface —
                      optimistic mutations, conflict-free sync, and sub-50ms
                      keystroke latency across every client&hellip;
                    </p>
                    <button
                      type="button"
                      className={`mt-1.5 text-[13px] font-medium text-acc-cyan underline-offset-4 hover:underline ${FOCUS}`}
                    >
                      Show more
                    </button>
                    <div className="mt-4 flex items-center justify-between gap-4">
                      <PrimaryLink
                        href="/listings"
                        className="rounded-xl px-5 py-2.5 text-sm font-semibold"
                      >
                        Apply Now
                      </PrimaryLink>
                      <EyebrowText className="text-body/60">
                        Found 3h ago
                      </EyebrowText>
                    </div>
                  </article>
                </div>

                <div className="mt-4 flex justify-center">
                  <SecondaryLink
                    href="/listings"
                    className="rounded-xl px-6 py-2.5 text-sm font-semibold"
                  >
                    Show more (28 remaining)
                  </SecondaryLink>
                </div>
                <p className="mt-3 text-center font-mono text-[11px] leading-relaxed text-body/60">
                  Jobs appear as they&rsquo;re verified — summary follows when
                  all subagents finish.
                </p>
              </div>
            </section>
          </div>
        </section>

        {/* ============ FEATURES ============ */}
        <section
          id="features"
          className="mx-auto max-w-6xl scroll-mt-20 px-8 py-20 sm:px-10 sm:py-24 xl:px-6"
        >
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-ice sm:text-4xl">
            One system for the entire hunt.
          </h2>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            <Card className="p-6 sm:p-7">
              <svg
                className="h-6 w-6 max-w-full text-acc-cyan"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="7" />
                <circle cx="12" cy="12" r="2.5" />
                <path
                  d="M12 2v3M12 19v3M2 12h3M19 12h3"
                  strokeLinecap="round"
                />
              </svg>
              <h3 className="mt-5 text-lg font-semibold text-ice">
                Smart Tracking
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-body">
                Track every role as a card in a searchable, filterable list,
                update status in one click from Open to Offer, with pipeline,
                conversion and activity summarized on your dashboard.
              </p>
            </Card>

            <Card className="p-6 sm:p-7">
              <svg
                className="h-6 w-6 max-w-full text-acc-cyan"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="6.5" />
                <path d="M20 20l-4-4" strokeLinecap="round" />
                <path d="M11 8v6M8 11h6" strokeLinecap="round" />
              </svg>
              <h3 className="mt-5 text-lg font-semibold text-ice">
                AI Job Research
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-body">
                Upload a{" "}
                <strong className="font-semibold text-ice">resume</strong> PDF
                to extract skills and seniority. Autonomous agents then stream
                jobs in real time, verify that companies are real and hiring,
                and dedupe cross-posted listings automatically before they hit
                your board.
              </p>
            </Card>

            <Card className="p-6 sm:p-7">
              <div className="flex items-start justify-between gap-3">
                <svg
                  className="h-6 w-6 max-w-full text-acc-cyan"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M22 10 12 5 2 10l10 5 10-5z" />
                  <path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" />
                  <path d="M22 10v6" />
                </svg>
                <PillSpan tone="accent-strong">Coming soon</PillSpan>
              </div>
              <h3 className="mt-5 text-lg font-semibold text-ice">DSA Prep</h3>
              <p className="mt-3 text-sm leading-relaxed text-body">
                Share your{" "}
                <span className="font-medium text-ice">
                  skills and target company + role
                </span>
                : AI finds the{" "}
                <span className="font-medium text-ice">
                  DSA problems those companies actually ask
                </span>
                . Track every solution by topic and difficulty, and revisit on a
                spaced schedule.
              </p>
            </Card>
          </div>
        </section>

        {/* ============ HOW IT WORKS ============ */}
        <section
          id="how-it-works"
          className="mx-auto max-w-6xl scroll-mt-20 px-8 py-20 sm:px-10 sm:py-24 xl:px-6"
        >
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-ice sm:text-4xl">
            Three steps from resume to offer.
          </h2>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-body sm:text-base">
            Your resume is the{" "}
            <span className="font-semibold text-ice">
              single source of truth
            </span>{" "}
            for the whole hunt. From{" "}
            <span className="text-ice">
              skill extraction, match scoring, deduped discovery
            </span>{" "}
            to pipeline tracking, every part of Keystone is designed for{" "}
            <span className="font-semibold text-acc-cyan">
              complete signal integrity.
            </span>
          </p>

          <div className="relative mt-14">
            <div
              className="pointer-events-none absolute bottom-8 left-[17px] top-2 hidden w-[2px] bg-[linear-gradient(to_bottom,rgba(0,184,214,0.35)_0%,rgba(0,184,214,0.35)_92%,rgba(0,184,214,0)_100%)] lg:block"
              aria-hidden="true"
            />

            <ol className="space-y-16 lg:space-y-14">
              <li className="relative grid min-w-0 items-start gap-8 lg:grid-cols-2 lg:gap-12">
                <div className="relative lg:pl-14">
                  <span
                    className="absolute left-0 top-0 hidden h-9 w-9 rotate-45 items-center justify-center rounded-[10px] border border-acc-cyan/50 bg-ink shadow-none lg:flex"
                    aria-hidden="true"
                  >
                    <span className="-rotate-45 font-mono text-[11px] font-bold text-acc-cyan">
                      01
                    </span>
                  </span>
                  <h3 className="text-xl font-semibold text-ice">
                    Upload resume
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-body">
                    Keystone parses your PDF and normalizes it against your
                    profile, ensuring only roles that fit your stack and
                    seniority reach your board.
                  </p>
                  <p className="mt-4 text-sm leading-relaxed text-body">
                    Keystone also{" "}
                    <span className="font-semibold text-ice">
                      infers skills directly from your resume
                    </span>
                    , so matching stays correct at both search time and review
                    time.
                  </p>
                </div>
                <Card className="min-w-0 overflow-hidden lg:ml-2">
                  <WindowChrome address="keystone.local/research · new" />
                  <div className="p-5 sm:p-6">
                    <section
                      className="space-y-4"
                      aria-label="Research form preview"
                    >
                      <div>
                        <span className="mb-2 block text-sm font-semibold text-ice">
                          Skills / resume
                        </span>
                        <div className="rounded-xl border border-edge bg-ink/60 transition-colors focus-within:border-acc-cyan">
                          <div className="flex flex-wrap items-center gap-2 px-3 pt-2.5">
                            <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-edge bg-[rgba(2,11,20,0.75)] px-[0.6rem] py-[0.3rem] font-mono text-[11px] normal-case tracking-normal text-body">
                              React
                            </span>
                            <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-edge bg-[rgba(2,11,20,0.75)] px-[0.6rem] py-[0.3rem] font-mono text-[11px] normal-case tracking-normal text-body">
                              TypeScript
                            </span>
                            <span className="min-w-[80px] flex-1 font-mono text-xs text-body/50">
                              Node.js…
                            </span>
                          </div>
                          <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-edge px-3 py-2">
                            <span className="truncate font-mono text-xs text-body/60">
                              resume.pdf · attached
                            </span>
                            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#00394C] bg-[rgba(3,16,25,0.6)] px-3 py-1.5 text-xs font-semibold text-ice">
                              Upload resume
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <span className="mb-2 block text-sm font-semibold text-ice">
                          Job types
                        </span>
                        <div className="grid grid-cols-3 gap-2">
                          <span className="rounded-xl border border-acc-cyan bg-acc-cyan px-2 py-2 text-center text-xs font-semibold text-ice shadow-[0_3px_12px_rgba(0,184,214,0.3)]">
                            Remote
                          </span>
                          <span className="rounded-xl border border-acc-cyan bg-acc-cyan px-2 py-2 text-center text-xs font-semibold text-ice shadow-[0_3px_12px_rgba(0,184,214,0.3)]">
                            Hybrid
                          </span>
                          <span className="rounded-xl border border-edge bg-ink/60 px-2 py-2 text-center text-xs font-semibold text-body">
                            Onsite
                          </span>
                        </div>
                      </div>

                      <div>
                        <span className="mb-2 block text-sm font-semibold text-ice">
                          Countries
                        </span>
                        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-edge bg-ink/60 px-3 py-2.5">
                          <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-edge bg-[rgba(2,11,20,0.75)] px-[0.6rem] py-[0.3rem] font-mono text-[11px] normal-case tracking-normal text-body">
                            Germany
                          </span>
                          <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-edge bg-[rgba(2,11,20,0.75)] px-[0.6rem] py-[0.3rem] font-mono text-[11px] normal-case tracking-normal text-body">
                            Netherlands
                          </span>
                          <span className="font-mono text-xs text-body/50">
                            EU remote…
                          </span>
                        </div>
                      </div>

                      <Link
                        href="/research/job"
                        className={`flex w-full items-center justify-center gap-2 rounded-xl border border-acc-cyan bg-acc-cyan px-5 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:border-[#33C7DE] hover:bg-[#33C7DE] ${FOCUS}`}
                      >
                        Start job research
                        <svg
                          className="h-4 w-4 max-w-full"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M13 7l5 5m0 0-5 5m5-5H6"
                          />
                        </svg>
                      </Link>
                    </section>
                  </div>
                </Card>
              </li>

              <li className="relative grid min-w-0 items-start gap-8 lg:grid-cols-2 lg:gap-12">
                <div className="relative lg:pl-14">
                  <span
                    className="absolute left-0 top-0 hidden h-9 w-9 rotate-45 items-center justify-center rounded-[10px] border border-acc-cyan/50 bg-ink shadow-none lg:flex"
                    aria-hidden="true"
                  >
                    <span className="-rotate-45 font-mono text-[11px] font-bold text-acc-cyan">
                      02
                    </span>
                  </span>
                  <h3 className="text-xl font-semibold text-ice">
                    Start research
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-body">
                    Define roles, countries and skills. Agents run in the
                    background, verify that companies are real and hiring, and
                    stream only new, deduped results.
                  </p>
                  <p className="mt-4 text-sm leading-relaxed text-body">
                    Every run is{" "}
                    <span className="font-semibold text-ice">
                      fully traceable
                    </span>
                    , thinking, tool calls and matches stay in one transcript.
                  </p>
                </div>
                <Card className="min-w-0 overflow-hidden lg:ml-2">
                  <WindowChrome address="keystone.local/research · running" />
                  <div className="p-6">
                    <div className="flex items-center justify-between gap-4">
                      <EyebrowText className="text-body/70">
                        Researching React jobs
                      </EyebrowText>
                      <PillSpan tone="accent">
                        <DotSpan color="bg-acc-cyan" />
                        Active
                      </PillSpan>
                    </div>
                    <div className="mt-4">
                      <div className="flex items-end justify-between">
                        <EyebrowText className="text-body/70">
                          Progress
                        </EyebrowText>
                        <span className="font-mono text-sm font-bold text-ice">
                          68%
                        </span>
                      </div>
                      <div
                        className="mt-2 h-2 w-full overflow-hidden rounded-full border border-edge bg-ink"
                        role="progressbar"
                        aria-valuenow={68}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Research progress"
                      >
                        <div
                          className="h-full rounded-full bg-acc-cyan"
                          style={{ width: "68%" }}
                        />
                      </div>
                    </div>
                    <div className="mt-4 space-y-2 font-mono text-xs leading-relaxed">
                      <p className="rounded-r-md border-l-2 border-ok/50 bg-ink/60 px-3 py-1.5 text-body/80">
                        ✓ scan job boards &amp; ATS feeds · done
                      </p>
                      <p className="rounded-r-md border-l-2 border-acc-cyan/60 bg-ink/60 px-3 py-1.5 text-body/80">
                        ∴ verify company &amp; funding signals · active
                      </p>
                      <p className="rounded-r-md border-l-2 border-edge bg-ink/60 px-3 py-1.5 text-body/60">
                        · dedupe cross-posts · pending
                      </p>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      <div className="rounded-xl border border-edge bg-ink/60 p-3">
                        <p className="font-mono text-lg font-bold text-ice">
                          128
                        </p>
                        <EyebrowText className="mt-1 text-body/70">
                          Found
                        </EyebrowText>
                      </div>
                      <div className="rounded-xl border border-edge bg-ink/60 p-3">
                        <p className="font-mono text-lg font-bold text-ok">
                          94
                        </p>
                        <EyebrowText className="mt-1 text-body/70">
                          Verified
                        </EyebrowText>
                      </div>
                      <div className="rounded-xl border border-edge bg-ink/60 p-3">
                        <p className="font-mono text-lg font-bold text-danger">
                          34
                        </p>
                        <EyebrowText className="mt-1 text-body/70">
                          Dupes
                        </EyebrowText>
                      </div>
                    </div>
                  </div>
                </Card>
              </li>

              <li className="relative grid min-w-0 items-start gap-8 lg:grid-cols-2 lg:gap-12">
                <div className="relative lg:pl-14">
                  <span
                    className="absolute left-0 top-0 hidden h-9 w-9 rotate-45 items-center justify-center rounded-[10px] border border-acc-cyan/50 bg-ink shadow-none lg:flex"
                    aria-hidden="true"
                  >
                    <span className="-rotate-45 font-mono text-[11px] font-bold text-acc-cyan">
                      03
                    </span>
                  </span>
                  <h3 className="text-xl font-semibold text-ice">
                    Apply + track
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-body">
                    Apply from the card, update status in one click through Open
                    → Applied → Interview → Offer, with Rejected and Declined
                    handled too. Filter by status, location and setup.
                  </p>
                  <p className="mt-4 text-sm leading-relaxed text-body">
                    Pipeline and conversion are{" "}
                    <span className="font-semibold text-ice">
                      summarized on your dashboard
                    </span>
                    , not scattered across tabs and spreadsheets.
                  </p>
                </div>
                <Card className="min-w-0 overflow-hidden lg:ml-2">
                  <WindowChrome address="keystone.local/dashboard" />
                  <div className="p-6 sm:p-7">
                    <div className="flex items-center justify-between gap-4">
                      <SectionLabelText>Conversion</SectionLabelText>
                      <PillSpan>all time</PillSpan>
                    </div>

                    <div className="mt-6 flex flex-col items-center gap-8 min-[560px]:flex-row">
                      <div className="relative h-36 w-36 flex-none">
                        <svg
                          className="h-36 w-36 max-w-full -rotate-90"
                          viewBox="0 0 120 120"
                          role="img"
                          aria-label="Donut chart: 41% applied, 13% interview, 18% offer rate"
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
                            strokeDasharray="128 314"
                            strokeLinecap="butt"
                          />
                          <circle
                            cx="60"
                            cy="60"
                            r="50"
                            fill="none"
                            stroke="#00B8D6"
                            strokeWidth="12"
                            strokeDasharray="41 314"
                            strokeDashoffset="-128"
                            strokeLinecap="butt"
                          />
                          <circle
                            cx="60"
                            cy="60"
                            r="50"
                            fill="none"
                            stroke="#10D9A0"
                            strokeWidth="12"
                            strokeDasharray="14 314"
                            strokeDashoffset="-169"
                            strokeLinecap="butt"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <p className="font-mono text-2xl font-bold text-ice">
                            41%
                          </p>
                          <EyebrowText className="mt-1 text-body/60">
                            applied
                          </EyebrowText>
                        </div>
                      </div>

                      <ul className="w-full min-w-0 flex-1 space-y-3 min-[560px]:w-auto">
                        <li className="flex items-center justify-between gap-4 border-b border-edge pb-3">
                          <span className="flex items-center gap-2.5 text-sm text-ice">
                            <DotSpan color="bg-info" />
                            Open → Applied
                          </span>
                          <span className="font-mono text-sm text-ice">
                            41%
                          </span>
                        </li>
                        <li className="flex items-center justify-between gap-4 border-b border-edge pb-3">
                          <span className="flex items-center gap-2.5 text-sm text-ice">
                            <DotSpan color="bg-acc-cyan" />
                            Applied → Interview
                          </span>
                          <span className="font-mono text-sm text-ice">
                            13%
                          </span>
                        </li>
                        <li className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-2.5 text-sm text-ice">
                            <DotSpan color="bg-ok" />
                            Interview → Offer
                          </span>
                          <span className="font-mono text-sm text-ok">18%</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </Card>
              </li>
            </ol>
          </div>
        </section>

        {/* ============ FINAL CTA ============ */}
        <section
          id="get-started"
          className="mx-auto max-w-6xl scroll-mt-20 px-8 pb-20 sm:px-10 sm:pb-28 xl:px-6"
        >
          <div className="relative overflow-hidden rounded-[20px] border border-edge bg-card px-8 py-14 text-center sm:px-10 sm:py-20">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_45%_at_50%_0%,rgba(0,184,214,0.1)_0%,transparent_70%)]"
              aria-hidden="true"
            />

            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-ice sm:text-4xl">
                Your pipeline deserves a keystone.
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-body sm:text-base">
                Free while self-hosted. Bring your own Postgres, point it at
                your boards, and let the agents run.
              </p>

              <div className="mt-9 flex justify-center">
                <PrimaryLink
                  href="/signup"
                  className="rounded-xl px-7 py-3 text-sm font-semibold"
                >
                  Get started
                </PrimaryLink>
              </div>

              <EyebrowText className="mt-6 text-body/70">
                No credit card required
              </EyebrowText>
            </div>
          </div>
        </section>
      </main>

      {/* ============ FOOTER ============ */}
      <footer className="border-t border-edge">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-8 py-8 text-center sm:px-10 md:flex-row md:justify-between md:gap-6 md:text-left xl:px-6">
          <p className="text-sm font-semibold text-ice">
            Keystone{" "}
            <span className="font-normal text-body">
              · Track. Discover. Ace.
            </span>
          </p>
          <EyebrowText className="text-body/70">
            Built for engineers hunting smarter
          </EyebrowText>
        </div>
      </footer>
    </div>
  );
}
