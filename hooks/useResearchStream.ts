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
  SubagentStartedPayload,
  ThinkingPayload,
  ToolEvent,
} from "@/lib/types/research";

const initialState: ResearchSession = {
  status: "idle",
  segments: [],
};

const SUBAGENT_ROUTE = "/research/subagent";

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

      if (status === "running") {
        if (!parentSubagent && !toolSegmentsRef.current[id]) {
          const segId = appendSegment(title ?? name, "tool");
          toolSegmentsRef.current[id] = segId;
        }
      } else if (status === "completed") {
        if (parentSubagent) {
          const start = subagentStartsRef.current[id];
          const durationMs = start ? Date.now() - start : tool.durationMs;
          const toolCount = Object.values(toolsRef.current).filter(
            (t) => t.sessionId === parentSubagent.childSessionId && t.id !== id,
          ).length;
          const link = subagentLink(
            parentSubagent.description,
            parentSubagent.childSessionId,
          );
          replaceSegment(
            id,
            `✓ ${link}\n↳ ${toolCount} tool${
              toolCount === 1 ? "" : "s"
            }${durationMs ? ` · ${formatDuration(durationMs)}` : ""}`,
          );
        } else {
          const segId = toolSegmentsRef.current[id];
          if (segId) {
            const completedText = `✓ ${title ?? name}${
              tool.durationMs ? ` (${formatDuration(tool.durationMs)})` : ""
            }`;
            replaceSegment(segId, completedText);
          }
        }
      } else if (status === "error") {
        const segId = toolSegmentsRef.current[id];
        if (segId) {
          const errorText = `✗ ${title ?? name}: ${tool.error ?? "error"}`;
          replaceSegment(segId, errorText);
        }
      }
    };

    eventSource.addEventListener("chunk", (e) => {
      const { text } = JSON.parse(e.data) as ChunkPayload;
      closeThinking();
      appendSegment(text);
    });

    eventSource.addEventListener("thinking", (e) => {
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
      const tool = JSON.parse(e.data) as ToolEvent;
      handleToolEvent({ ...tool, status: "running" });
    });

    eventSource.addEventListener("tool.completed", (e) => {
      const tool = JSON.parse(e.data) as ToolEvent;
      handleToolEvent({ ...tool, status: "completed" });
    });

    eventSource.addEventListener("tool.error", (e) => {
      const tool = JSON.parse(e.data) as ToolEvent;
      handleToolEvent({ ...tool, status: "error" });
    });

    eventSource.addEventListener("subagent.started", (e) => {
      const payload = JSON.parse(e.data) as SubagentStartedPayload;
      subagentsRef.current = {
        ...subagentsRef.current,
        [payload.id]: {
          id: payload.id,
          childSessionId: payload.childSessionId,
          description: payload.description,
          agent: payload.agent,
          text: "",
        },
      };
      subagentStartsRef.current[payload.id] = Date.now();

      const link = subagentLink(
        payload.description || "Subagent",
        payload.childSessionId,
      );
      appendSegment(`Delegating ${link}...`, "tool");
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
