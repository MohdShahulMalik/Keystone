import type { ReactNode } from "react";

export type AgentProgressStep = {
  id: string;
  label: string;
  detail?: string;
  status?: "pending" | "active" | "done" | "error";
};

export type AgentProgressMetric = {
  label: string;
  value: string;
};

type AgentProgressProps = {
  title: string;
  subtitle?: string;
  status?: string;
  progress?: number; // 0-100
  steps?: AgentProgressStep[];
  metrics?: AgentProgressMetric[];
  footer?: ReactNode;
};

function getStatusTone(status?: AgentProgressStep["status"]) {
  switch (status) {
    case "done":
      return "bg-emerald-500/15 text-emerald-400";
    case "active":
      return "bg-sky-500/15 text-sky-400";
    case "error":
      return "bg-rose-500/15 text-rose-400";
    default:
      return "bg-surface-800 text-foreground-600";
  }
}

export function AgentProgress({
  title,
  subtitle,
  status,
  progress,
  steps = [],
  metrics = [],
  footer,
}: AgentProgressProps) {
  const clampedProgress = Math.max(0, Math.min(100, progress ?? 0));

  return (
    <section className="rounded-2xl border border-stroke bg-surface-800 p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-foreground-600-subtle">
            Agent Progress
          </p>
          <h2 className="mt-2 text-2xl font-bold text-foreground-900">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-2 text-sm text-foreground-600">{subtitle}</p>
          ) : null}
        </div>

        {status ? (
          <span className="rounded-full border border-stroke bg-surface-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-foreground-600">
            {status}
          </span>
        ) : null}
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between text-xs text-foreground-600">
          <span>Progress</span>
          <span>{clampedProgress}%</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-900">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-indigo-400 transition-all"
            style={{ width: `${clampedProgress}%` }}
            aria-hidden="true"
          />
        </div>
      </div>

      {metrics.length > 0 ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-xl border border-stroke bg-surface-900 px-4 py-3"
            >
              <p className="text-xs uppercase tracking-[0.2em] text-foreground-600-subtle">
                {metric.label}
              </p>
              <p className="mt-2 text-lg font-semibold text-foreground-900">
                {metric.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {steps.length > 0 ? (
        <div className="mt-6 space-y-3">
          {steps.map((step) => (
            <div
              key={step.id}
              className="flex items-start justify-between gap-4 rounded-xl border border-stroke bg-surface-900 px-4 py-3"
            >
              <div>
                <p className="text-sm font-semibold text-foreground-900">
                  {step.label}
                </p>
                {step.detail ? (
                  <p className="mt-1 text-xs text-foreground-600">
                    {step.detail}
                  </p>
                ) : null}
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${getStatusTone(
                  step.status,
                )}`}
              >
                {step.status ?? "pending"}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {footer ? <div className="mt-6">{footer}</div> : null}
    </section>
  );
}
