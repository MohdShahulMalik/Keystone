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
  mainText: "",
};

const THINKING_OPEN = "\n\n<small>**Thinking:** ";
const THINKING_CLOSE = "</small>\n\n";

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

function formatInput(input: ToolEvent["input"]): string {
  if (!input) return "";
  try {
    return JSON.stringify(input);
  } catch {
    return "";
  }
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

export function useResearchStream(sessionId: string | null) {
  const [state, setState] = useState<ResearchSession>(initialState);
  const inThinkingRef = useRef(false);
  const toolsRef = useRef<Record<string, ToolEvent>>({});
  const subagentsRef = useRef<Record<string, Subagent>>({});
  const subagentStartsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!sessionId) return;

    inThinkingRef.current = false;
    toolsRef.current = {};
    subagentsRef.current = {};
    subagentStartsRef.current = {};

    const eventSource = new EventSource(
      `/api/research/stream?sessionId=${sessionId}`,
    );

    const closeThinking = () => {
      if (!inThinkingRef.current) return;
      inThinkingRef.current = false;
      setState((prev) => ({
        ...prev,
        mainText: prev.mainText + THINKING_CLOSE,
      }));
    };

    const handleToolEvent = (tool: ToolEvent) => {
      const { id, tool: name, title, input, sessionId } = tool;
      const status = tool.status ?? "running";

      toolsRef.current[id] = {
        ...(toolsRef.current[id] ?? tool),
        ...tool,
        status,
      };

      let text = "";

      const owner = sessionId
        ? Object.values(subagentsRef.current).find(
            (s) => s.childSessionId === sessionId,
          )
        : undefined;

      const parentSubagent = Object.values(subagentsRef.current).find(
        (s) => s.id === id,
      );

      if (status === "running") {
        if (owner) {
          const count = Object.values(toolsRef.current).filter(
            (t) => t.sessionId === owner.childSessionId,
          ).length;
          text = ` (${count} tool${count === 1 ? "" : "s"})`;
        }
        if (!parentSubagent) {
          text = `\n\n${title ?? name}${formatInput(input)} ...`;
        }
      } else if (status === "completed") {
        if (parentSubagent) {
          const start = subagentStartsRef.current[id];
          const durationMs = start ? Date.now() - start : tool.durationMs;
          const toolCount = Object.values(toolsRef.current).filter(
            (t) =>
              t.sessionId === parentSubagent.childSessionId &&
              t.id !== id,
          ).length;
          const link = subagentLink(
            parentSubagent.description,
            parentSubagent.childSessionId,
          );
          text = `\n\n✓${link}\n↳ ${toolCount} tool${
            toolCount === 1 ? "" : "s"
          }${durationMs ? ` · ${formatDuration(durationMs)}` : ""}`;
        } else {
          text = `\n\n✓ ${title ?? name}${
            tool.durationMs ? ` (${formatDuration(tool.durationMs)})` : ""
          }`;
        }
      } else if (status === "error") {
        text = `\n\n✗ ${title ?? name}: ${tool.error ?? "error"}`;
      }

      if (text) {
        setState((prev) => ({
          ...prev,
          mainText: prev.mainText + text,
        }));
      }
    };

    eventSource.addEventListener("chunk", (e) => {
      const { text } = JSON.parse(e.data) as ChunkPayload;
      closeThinking();
      setState((prev) => ({
        ...prev,
        mainText: prev.mainText + text,
      }));
    });

    eventSource.addEventListener("thinking", (e) => {
      const { text, done } = JSON.parse(e.data) as ThinkingPayload;
      setState((prev) => {
        let mainText = prev.mainText;
        if (!inThinkingRef.current) {
          inThinkingRef.current = true;
          mainText += THINKING_OPEN;
        }
        mainText += text;
        return { ...prev, mainText };
      });
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
      subagentsRef.current[payload.id] = {
        id: payload.id,
        childSessionId: payload.childSessionId,
        description: payload.description,
        agent: payload.agent,
        text: "",
      };
      subagentStartsRef.current[payload.id] = Date.now();

      const link = subagentLink(
        payload.description || "Subagent",
        payload.childSessionId,
      );
      setState((prev) => ({
        ...prev,
        mainText: prev.mainText + `\n\nDelegating ${link}...`,
      }));
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
      if (!target) return;
      subagentsRef.current[target].text += text;
    });

    eventSource.addEventListener("message.completed", (e) => {
      const { messageId } = JSON.parse(e.data) as MessageCompletedPayload;
      setState((prev) => ({
        ...prev,
        messageId,
      }));
    });

    eventSource.addEventListener("error", (e: MessageEvent) => {
      const data = (e.data
        ? JSON.parse(e.data)
        : { message: "Connection error" }) as ErrorPayload;
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
    toolsRef.current = {};
    subagentsRef.current = {};
    subagentStartsRef.current = {};
    setState(initialState);
  }, []);

  return { ...state, reset };
}
