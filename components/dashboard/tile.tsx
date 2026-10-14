import type { ReactNode } from "react";

/**
 * Bento tile shell — ports `.tile` (bg #031019, 1px #00212E border,
 * 24px radius, border-color transition, cyan hover border) to Tailwind.
 * Callers own padding and grid placement via `className`.
 */
export function Tile({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className={`rounded-3xl border border-edge bg-card transition-colors duration-300 hover:border-[rgba(0,184,214,0.5)] ${className}`}
    >
      {children}
    </section>
  );
}

/**
 * Ports `.section-label` + `::before` dash (Space Grotesk 600, 13px,
 * 0.12em tracking, uppercase, leading 1, flex, 0.75rem gap, 1.5rem x 2px
 * cyan dash) to Tailwind.
 */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-3 font-display text-[13px] font-semibold uppercase leading-none tracking-[0.12em] text-acc-cyan before:h-0.5 before:w-6 before:flex-none before:bg-acc-cyan before:content-['']">
      {children}
    </p>
  );
}

/**
 * Ports `.eyebrow` (Space Mono, uppercase, 0.14em tracking, 11px,
 * 1.4 line-height) to Tailwind.
 */
export function Eyebrow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`font-mono text-[11px] uppercase leading-[1.4] tracking-[0.14em] text-body/60 ${className}`}
    >
      {children}
    </p>
  );
}

/**
 * Ports `.pill` (inline-flex, 0.5rem gap, 8px radius, 1px #00212E border,
 * rgba(2,11,20,.75) bg, .3rem/.6rem padding, Space Mono 11px, 0.08em
 * tracking, uppercase, #7AB5C6, nowrap, max-width 100%) to Tailwind.
 */
export function Pill({
  tone = "neutral",
  live = false,
  children,
}: {
  /** `live` swaps the resting dot for a pulsing one. */
  tone?: "neutral" | "success" | "accent";
  live?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-2 whitespace-nowrap rounded-lg border bg-[rgba(2,11,20,0.75)] px-[0.6rem] py-[0.3rem] font-mono text-[11px] uppercase tracking-[0.08em] ${
        tone === "success"
          ? "border-ok/30 text-ok"
          : tone === "accent"
            ? "border-acc-cyan/30 text-acc-cyan"
            : "border-edge text-body"
      }`}
    >
      {live ? <LiveDot /> : null}
      {children}
    </span>
  );
}

/**
 * Ports `.dot` (6px circle) to Tailwind. `color` takes a Tailwind bg class.
 */
export function Dot({ color }: { color: string }) {
  return (
    <span
      className={`h-1.5 w-1.5 flex-none rounded-full ${color}`}
      aria-hidden="true"
    />
  );
}

/**
 * Ports `.pulse-dot` (1.6s ease-in-out infinite pulse, disabled under
 * prefers-reduced-motion) to Tailwind using the built-in pulse keyframes —
 * no custom CSS.
 */
export function LiveDot() {
  return (
    <span
      className="h-1.5 w-1.5 flex-none rounded-full bg-ok motion-safe:animate-[pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none"
      aria-hidden="true"
    />
  );
}
