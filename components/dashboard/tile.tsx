import type { ReactNode } from "react";

/**
 * Bento tile shell — surface, border and hover only.
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
      className={`rounded-3xl border border-stroke bg-surface-800 transition-colors hover:border-accent/50 ${className}`}
    >
      {children}
    </section>
  );
}

/** Cyan tile heading with the leading dash from the template. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-3 font-display text-[13px] font-semibold uppercase tracking-[0.12em] text-accent before:h-0.5 before:w-6 before:bg-accent before:content-['']">
      {children}
    </p>
  );
}

/** Small uppercase mono caption above a card's content. */
export function Eyebrow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`font-mono text-[11px] uppercase tracking-[0.14em] text-foreground-600/60 ${className}`}
    >
      {children}
    </p>
  );
}

export function Pill({
  tone = "neutral",
  live = false,
  children,
}: {
  /** `live` swaps the resting dot for a pulsing one. */
  tone?: "neutral" | "success";
  live?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg border bg-surface-900/75 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider ${
        tone === "success"
          ? "border-success/30 text-success"
          : "border-stroke text-foreground-600"
      }`}
    >
      {live ? (
        <span
          className="h-1.5 w-1.5 flex-none rounded-full bg-success motion-safe:animate-pulse"
          aria-hidden="true"
        />
      ) : null}
      {children}
    </span>
  );
}

export function Dot({ color }: { color: string }) {
  return (
    <span
      className={`h-1.5 w-1.5 flex-none rounded-full ${color}`}
      aria-hidden="true"
    />
  );
}
