import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChunkPayload,
  ErrorPayload,
  MessageCompletedPayload,
  ResearchSession,
  ResearchStatus,
  StatusPayload,
  Subagent,
  SubagentChunkPayload,
  SubagentCompletedPayload,
  SubagentStartedPayload,
  ThinkingPayload,
  ToolEvent,
} from "@/lib/types/research";

const initialState: ResearchSession = {
  status: "idle",
  segments: [],
};

const SUBAGENT_ROUTE = "/research/job";

function normalizeStatus(raw: unknown): ResearchStatus | null {
  if (
    raw === "idle" ||
    raw === "connecting" ||
    raw === "running" ||
    raw === "completed" ||
    raw === "error"
  ) {
    return raw;
  }

  if (raw && typeof raw === "object") {
    const type = (raw as { type?: unknown }).type;
    if (type === "busy") return "running";
    if (type === "idle") return "idle";
  }

  return null;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m > 0) return `${m}m ${s % 60}s`;
  if (s > 0) return `${s}s`;
  return `${ms}ms`;
}

function toTitleCase(tool: string): string {
  return tool.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function webfetchDisplay(tool: ToolEvent): string {
  const name = toTitleCase(tool.tool);
  const url = (tool.input as Record<string, unknown> | undefined)?.url as string | undefined;
  if (tool.tool === "webfetch" && url) {
    return `${name} ↳ ${url}`;
  }
  return tool.title ?? name;
}

function subagentLink(text: string, childSessionId: string): string {
  return `[${text}](${SUBAGENT_ROUTE}?sessionId=${encodeURIComponent(childSessionId)})`;
}

let segmentCounter = 0;
function uniqueId(): string {
  return `seg-${++segmentCounter}-${Date.now()}`;
}

export function useResearchStream(sessionId: string | null) {
  const [state, setState] = useState<ResearchSession>(initialState);
  const thinkingIdRef = useRef<string | null>(null);
  const inThinkingRef = useRef(false);
  const toolsRef = useRef<Record<string, ToolEvent>>({});
  const toolSegmentsRef = useRef<Record<string, string>>({});
  const subagentsRef = useRef<Record<string, Subagent>>({});
  const subagentStartsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!sessionId) return;

    inThinkingRef.current = false;
    thinkingIdRef.current = null;
    toolsRef.current = {};
    toolSegmentsRef.current = {};
    subagentsRef.current = {};
    subagentStartsRef.current = {};

    const eventSource = new EventSource(
      `/api/research/stream?sessionId=${sessionId}`,
    );

    const appendSegment = (
      text: string,
      kind: "text" | "thinking" | "tool" = "text",
    ) => {
      const id = uniqueId();
      setState((prev) => ({
        ...prev,
        segments: [...prev.segments, { id, text, kind }],
      }));
      return id;
    };

    const replaceSegment = (id: string, text: string) => {
      setState((prev) => ({
        ...prev,
        segments: prev.segments.map((s) => (s.id === id ? { ...s, text } : s)),
      }));
    };

    const closeThinking = () => {
      inThinkingRef.current = false;
      thinkingIdRef.current = null;
    };

    const ensureRunning = () => {
      setState((prev) => (prev.status !== "running" ? { ...prev, status: "running" } : prev));
    };

    const subagentTitleLine = (s: Subagent) =>
      `${toTitleCase(s.subagentType || "general")} Task - ${s.title || s.description || "Subagent"}`;

    const subagentToolLine = (tool: ToolEvent): string => {
      const url = (tool.input as Record<string, unknown> | undefined)?.url as string | undefined;
      const query = (tool.input as Record<string, unknown> | undefined)?.query as string | undefined;
      if (tool.tool === "webfetch" && url) return `${toTitleCase(tool.tool)} ${url}${tool.title && tool.title !== url ? ` (${tool.title})` : ""}`.trim();
      if (tool.tool === "websearch" && query) return `${toTitleCase(tool.tool)} ${tool.title || query}`.trim();
      return tool.title ?? toTitleCase(tool.tool);
    };

    const handleToolEvent = (tool: ToolEvent) => {
      const { id, tool: name, title } = tool;
      const status = tool.status ?? "running";

      toolsRef.current = {
        ...toolsRef.current,
        [id]: { ...(toolsRef.current[id] ?? tool), ...tool, status },
      };

      const prevSubagents = subagentsRef.current;
      const parentSubagent = Object.values(prevSubagents).find(
        (s) => s.id === id,
      );
      const isChildTool = !!tool.sessionId && Object.values(prevSubagents).some((s) => s.childSessionId === tool.sessionId);

      if (status === "running") {
        if (isChildTool) {
          const parent = Object.values(prevSubagents).find((s) => s.childSessionId === tool.sessionId);
          if (parent) {
            const segId = toolSegmentsRef.current[parent.id];
            if (segId) {
              const titleLine = subagentTitleLine(parent);
              const link = subagentLink(titleLine, parent.childSessionId);
              const toolLine = subagentToolLine(tool);
              replaceSegment(segId, `∴ ${link}\n↳ ${toolLine}`);
            }
          }
          return;
        }
        if (tool.tool === "task") return;
        if (!parentSubagent && !toolSegmentsRef.current[id]) {
          const display = webfetchDisplay(tool);
          const segId = appendSegment(display, "tool");
          toolSegmentsRef.current[id] = segId;
        }
      } else if (status === "completed") {
        if (parentSubagent) {
          // task tool completed is now handled via subagent.completed, ignore here to avoid duplicate
          return;
        } else {
          if (isChildTool) {
            const parent = Object.values(prevSubagents).find((s) => s.childSessionId === tool.sessionId);
            if (parent) {
              const segId = toolSegmentsRef.current[parent.id];
              if (segId) {
                const titleLine = subagentTitleLine(parent);
                const link = subagentLink(titleLine, parent.childSessionId);
                const toolLine = subagentToolLine(tool);
                const prefix = tool.status === "error" ? "✗" : "✓";
                // keep ∴ while parent still running, show last tool with status
                replaceSegment(segId, `∴ ${link}\n↳ ${toolLine}${tool.status === "error" ? ` · ${tool.error}` : ""}`);
              }
            }
            return;
          }
          const segId = toolSegmentsRef.current[id];
          if (segId) {
            const base = webfetchDisplay(tool);
            const completedText = `✓ ${base}${tool.durationMs ? ` (${formatDuration(tool.durationMs)})` : ""}`;
            replaceSegment(segId, completedText);
          }
        }
      } else if (status === "error") {
        if (isChildTool) {
          const parent = Object.values(prevSubagents).find((s) => s.childSessionId === tool.sessionId);
          if (parent) {
            const segId = toolSegmentsRef.current[parent.id];
            if (segId) {
              const titleLine = subagentTitleLine(parent);
              const link = subagentLink(titleLine, parent.childSessionId);
              const toolLine = subagentToolLine(tool);
              replaceSegment(segId, `∴ ${link}\n↳ ✗ ${toolLine}: ${tool.error ?? "error"}`);
            }
          }
          return;
        }
        const segId = toolSegmentsRef.current[id];
        if (segId) {
          const base = webfetchDisplay(tool);
          const errorText = `✗ ${base}: ${tool.error ?? "error"}`;
          replaceSegment(segId, errorText);
        }
      }
    };

    eventSource.addEventListener("chunk", (e) => {
      ensureRunning();
      const { text } = JSON.parse(e.data) as ChunkPayload;
      closeThinking();
      appendSegment(text);
    });

    eventSource.addEventListener("thinking", (e) => {
      ensureRunning();
      const { text, done } = JSON.parse(e.data) as ThinkingPayload;

      if (!inThinkingRef.current) {
        if (!text && done) return;
        inThinkingRef.current = true;
        thinkingIdRef.current = appendSegment(text, "thinking");
        return;
      }

      const tid = thinkingIdRef.current;
      if (tid && text) {
        setState((prev) => ({
          ...prev,
          segments: prev.segments.map((s) =>
            s.id === tid ? { ...s, text: s.text + text } : s,
          ),
        }));
      }

      if (done) closeThinking();
    });

    eventSource.addEventListener("status", (e) => {
      const { status } = JSON.parse(e.data) as StatusPayload;
      const normalized = normalizeStatus(status);
      if (!normalized) return;
      setState((prev) => ({
        ...prev,
        status: normalized,
      }));
    });

    eventSource.addEventListener("tool.started", (e) => {
      ensureRunning();
      const tool = JSON.parse(e.data) as ToolEvent;
      handleToolEvent({ ...tool, status: "running" });
    });

    eventSource.addEventListener("tool.completed", (e) => {
      ensureRunning();
      const tool = JSON.parse(e.data) as ToolEvent;
      handleToolEvent({ ...tool, status: "completed" });
    });

    eventSource.addEventListener("tool.error", (e) => {
      ensureRunning();
      const tool = JSON.parse(e.data) as ToolEvent;
      handleToolEvent({ ...tool, status: "error" });
    });

    eventSource.addEventListener("subagent.started", (e) => {
      ensureRunning();
      const payload = JSON.parse(e.data) as SubagentStartedPayload;
      const subagent: Subagent = {
        id: payload.id,
        childSessionId: payload.childSessionId,
        title: payload.title,
        description: payload.description,
        subagentType: payload.subagentType,
        text: "",
      };
      subagentsRef.current = {
        ...subagentsRef.current,
        [payload.id]: subagent,
      };
      subagentStartsRef.current[payload.id] = Date.now();

      // remove redundant plain text that is exactly the subagent title (e.g. "Search LinkedIn Rust jobs" before the formatted subagent block)
      setState((prev) => {
        const lastSeg = prev.segments[prev.segments.length - 1];
        const t = (payload.title || payload.description || "").trim();
        if (lastSeg && lastSeg.kind !== "tool" && lastSeg.kind !== "thinking" && lastSeg.text.trim() === t) {
          return { ...prev, segments: prev.segments.slice(0, -1) };
        }
        return prev;
      });

      const titleLine = subagentTitleLine(subagent);
      const link = subagentLink(titleLine, payload.childSessionId);
      const segId = appendSegment(`∴ ${link}\n↳ Starting...`, "tool");
      toolSegmentsRef.current[payload.id] = segId;
    });

    eventSource.addEventListener("subagent.chunk", (e) => {
      const { id, childSessionId, text } = JSON.parse(
        e.data,
      ) as SubagentChunkPayload;
      const key = id || childSessionId;
      const target = subagentsRef.current[key]
        ? key
        : subagentsRef.current[id]
          ? id
          : undefined;
      if (target) {
        subagentsRef.current = {
          ...subagentsRef.current,
          [target]: {
            ...subagentsRef.current[target],
            text: subagentsRef.current[target].text + text,
          },
        };
      }
    });

    eventSource.addEventListener("subagent.completed", (e) => {
      const payload = JSON.parse(e.data) as SubagentCompletedPayload;
      const subagent = subagentsRef.current[payload.id];
      const segId = toolSegmentsRef.current[payload.id];
      if (!subagent || !segId) return;
      const start = subagentStartsRef.current[payload.id];
      const durationMs = payload.durationMs ?? (start ? Date.now() - start : undefined);
      const toolCount = Object.values(toolsRef.current).filter(
        (t) => t.sessionId === payload.childSessionId,
      ).length;
      const titleLine = subagentTitleLine({ ...subagent, title: payload.title, description: payload.description, subagentType: payload.subagentType } as Subagent);
      const link = subagentLink(titleLine, payload.childSessionId);
      const timeTaken = payload.timeTaken ?? (durationMs ? formatDuration(durationMs) : undefined);
      replaceSegment(segId, `✓ ${link}\n↳ ${toolCount} tool${toolCount === 1 ? "" : "s"}${timeTaken ? ` · ${timeTaken}` : ""}`);
    });

    eventSource.addEventListener("message.completed", (e) => {
      const { messageId } = JSON.parse(e.data) as MessageCompletedPayload;
      setState((prev) => ({
        ...prev,
        messageId,
      }));
    });

    eventSource.addEventListener("error", (e: MessageEvent) => {
      const data = (
        e.data ? JSON.parse(e.data) : { message: "Connection error" }
      ) as ErrorPayload;
      closeThinking();
      setState((prev) => ({
        ...prev,
        status: "error",
        error: data.message,
      }));
      eventSource.close();
    });

    eventSource.addEventListener("done", () => {
      closeThinking();
      setState((prev) => ({
        ...prev,
        status: "completed",
      }));
      eventSource.close();
    });

    eventSource.onerror = () => {
      closeThinking();
      setState((prev) => ({
        ...prev,
        status: "error",
        error: "Connection error",
      }));
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [sessionId]);

  const reset = useCallback(() => {
    inThinkingRef.current = false;
    thinkingIdRef.current = null;
    toolsRef.current = {};
    toolSegmentsRef.current = {};
    subagentsRef.current = {};
    subagentStartsRef.current = {};
    setState(initialState);
  }, []);

  return { ...state, reset };
}
