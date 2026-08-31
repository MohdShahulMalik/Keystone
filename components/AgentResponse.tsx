"use client";

import Link from "next/link";
import { Streamdown } from "streamdown";
import type { ResearchStatus, TextSegment } from "@/lib/types/research";

const streamdownLink = {
  a: ({
    href,
    children,
    node: _node,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) => {
    if (href?.startsWith("/")) {
      return (
        <Link href={href as string} {...rest}>
          {children}
        </Link>
      );
    }
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
} as React.ComponentProps<typeof Streamdown>["components"];

function JumpingDots() {
  return (
    <span className="inline-flex items-end gap-1 align-middle" aria-label="Agent is responding">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:300ms]" />
    </span>
  );
}

function SegmentStream({ segments }: { segments: TextSegment[] }) {
  const blocks: React.ReactNode[] = [];
  let markdown = "";

  const flushMarkdown = (key: string) => {
    if (!markdown) return;
    const content = markdown;
    markdown = "";
    blocks.push(
      <div
        key={key}
        className="text-sm leading-relaxed text-foreground-600 [&_a]:text-accent [&_a]:underline [&_code]:font-mono [&_code]:text-accent [&_h1]:text-foreground-900 [&_h2]:text-foreground-900 [&_h3]:text-foreground-900 [&_h4]:text-foreground-900 [&_strong]:text-foreground-900 [&_table]:text-xs"
      >
        <Streamdown components={streamdownLink}>{content}</Streamdown>
      </div>,
    );
  };

  const toolTone = (text: string) => {
    if (text.includes("✗")) return "border-l-danger";
    if (text.includes("✓")) return "border-l-success";
    return "border-l-accent";
  };

  const isRunningSubagent = (text: string) => text.trimStart().startsWith("∴");

  segments.forEach((segment, i) => {
    if (segment.kind === "thinking") {
      flushMarkdown(`md-${i}`);
      blocks.push(
        <div
          key={segment.id}
          className="rounded-r-lg border-l-2 border-info/40 bg-surface-700/40 px-3 py-2 text-xs italic leading-relaxed text-foreground-600-subtle"
        >
          <span className="font-semibold not-italic text-info">Thinking:</span>{" "}
          <Streamdown components={streamdownLink}>{segment.text}</Streamdown>
        </div>,
      );
      return;
    }

    if (segment.kind === "tool") {
      flushMarkdown(`md-${i}`);
      const running = isRunningSubagent(segment.text);
      blocks.push(
        <div
          key={segment.id}
          className={`rounded-r-md border-l-2 ${toolTone(segment.text)} bg-surface-800 px-3 py-1.5 font-mono text-xs text-foreground-600-subtle [&_a]:text-accent [&_a]:underline [&_p]:my-0 [&_p]:whitespace-pre-wrap ${running ? "animate-pulse" : ""}`}
        >
          <Streamdown components={streamdownLink}>{segment.text}</Streamdown>
        </div>,
      );
      return;
    }

    markdown += segment.text;
  });
  flushMarkdown(`md-${segments.length}`);

  return <div className="space-y-3">{blocks}</div>;
}

type AgentResponseProps = {
  segments: TextSegment[];
  status: ResearchStatus;
  error?: string | null;
};

export function AgentResponse({ segments, status, error }: AgentResponseProps) {
  const isStreaming = status === "running" || status === "connecting";
  return (
    <div className="flex justify-start">
      <div className="max-w-2xl">
        <div className="text-sm leading-relaxed text-foreground-600">
          {segments.length > 0 ? (
            <>
              <SegmentStream segments={segments} />
              {isStreaming ? (
                <span className="mt-3 inline-block">
                  <JumpingDots />
                </span>
              ) : null}
            </>
          ) : (
            <JumpingDots />
          )}
        </div>
        {error ? (
          <p className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/15 px-4 py-2 text-sm text-rose-400">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
