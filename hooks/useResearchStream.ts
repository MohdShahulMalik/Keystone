import { useCallback, useEffect, useRef, useState } from "react";
import type { JobPayload } from "@/lib/research/job-schema";
import { StreamedJobSchema } from "@/lib/research/job-schema";
import type {
  ChunkPayload,
  ErrorPayload,
  MessageCompletedPayload,
  ResearchSession,
  ResearchStatus,
  SequencedSegment,
  StatusPayload,
  Subagent,
  SubagentChunkPayload,
  SubagentCompletedPayload,
  SubagentLive,
  SubagentStartedPayload,
  SubagentThinkingPayload,
  ThinkingPayload,
  ToolEvent,
} from "@/lib/types/research";

const initialState: ResearchSession = {
  status: "idle",
  segments: [],
  jobs: [],
};

// Text/thinking deltas are emitted with the pre-increment seq (server persists
// the segment at seq + 1), so persisted/live segments line up at seq + 1.
function liveSeq(seq: number | undefined): number {
  return (seq ?? 0) + 1;
}

export function parseSubagentIdFromHref(href: string): string | null {
  const match = /[?&]subagentId=([^&]+)/.exec(href);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

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
  const url = (tool.input as Record<string, unknown> | undefined)?.url as
    | string
    | undefined;
  if (tool.tool === "webfetch" && url) {
    return `${name} ↳ ${url}`;
  }
  return tool.title ?? name;
}

function subagentLink(
  text: string,
  childSessionId: string,
  mode: string,
  parentSessionId: string | null,
): string {
  const params = new URLSearchParams();
  if (parentSessionId) params.set("sessionId", parentSessionId);
  params.set("subagentId", childSessionId);
  return `[${text}](/research/${mode}?${params.toString()})`;
}

let segmentCounter = 0;
function uniqueId(): string {
  return `seg-${++segmentCounter}-${Date.now()}`;
}

export function useResearchStream(
  sessionId: string | null,
  initial?: { segments?: ResearchSession["segments"]; jobs?: JobPayload[] },
  options?: { mode?: "job" | "dsa" },
) {
  const [state, setState] = useState<ResearchSession>(initialState);
  const [subagentLive, setSubagentLive] = useState<
    Record<string, SubagentLive>
  >({});
  const thinkingIdRef = useRef<string | null>(null);
  const inThinkingRef = useRef(false);
  const toolsRef = useRef<Record<string, ToolEvent>>({});
  const toolSegmentsRef = useRef<Record<string, string>>({});
  const subagentsRef = useRef<Record<string, Subagent>>({});
  const subagentStartsRef = useRef<Record<string, number>>({});
  // Highest committed parent seq seen (DB seed + live events). Sent as
  // ?sinceSeq= so reconnects get server replay instead of relying on memory.
  const maxSeqRef = useRef(0);

  const mode = options?.mode ?? "job";

  const seedSegments = initial?.segments ?? [];
  const seedJobs = initial?.jobs ?? [];
  const seedSegLen = seedSegments.length;
  const seedJobLen = seedJobs.length;

  // text/thinking deltas append into the segment at their live seq; tool
  // events replace the segment at their own seq (server already bumps ctx.seq
  // before persisting tools, so tool seq needs no offset).
  const upsertSubagentSegment = useCallback(
    (
      childSessionId: string,
      seq: number,
      kind: SequencedSegment["kind"],
      text: string,
      merge: "append" | "replace",
    ) => {
      setSubagentLive((prev) => {
        const existing = prev[childSessionId];
        if (!existing) return prev;
        const segments = [...existing.segments];
        const at = segments.findIndex((s) => s.seq === seq);
        if (at === -1) {
          segments.push({
            id: `live-${childSessionId}-${seq}`,
            seq,
            kind,
            text,
          });
        } else if (merge === "replace") {
          segments[at] = { ...segments[at], kind, text };
        } else if (text) {
          segments[at] = { ...segments[at], text: segments[at].text + text };
        } else {
          return prev;
        }
        segments.sort((a, b) => a.seq - b.seq);
        return {
          ...prev,
          [childSessionId]: { ...existing, segments },
        };
      });
    },
    [],
  );

  // Seed from DB history: runs once per sessionId / history load, before
  // live SSE appends. The hub is the seq authority — seed ids carry the
  // committed seq (`db-<seq>`) so the SSE replay (?sinceSeq=) skips rows we
  // already hold instead of duplicating them.
  // biome-ignore lint/correctness/useExhaustiveDependencies: seed by length only to avoid refires on array identity
  useEffect(() => {
    inThinkingRef.current = false;
    thinkingIdRef.current = null;
    toolsRef.current = {};
    toolSegmentsRef.current = {};
    subagentsRef.current = {};
    subagentStartsRef.current = {};
    let maxSeed = 0;
    for (const s of seedSegments) {
      const m = /^db-(\d+)$/.exec(s.id);
      if (m) {
        const n = Number.parseInt(m[1], 10);
        if (Number.isFinite(n) && n > maxSeed) maxSeed = n;
      }
    }
    maxSeqRef.current = maxSeed;
    setSubagentLive({});
    setState({
      status:
        seedSegLen > 0 || seedJobLen > 0
          ? sessionId
            ? "connecting"
            : "completed"
          : sessionId
            ? "connecting"
            : "idle",
      segments: seedSegments,
      jobs: seedJobs,
    });
  }, [sessionId, seedSegLen, seedJobLen]);

  useEffect(() => {
    if (!sessionId) return;
    let closed = false;
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const buildUrl = (since: number) =>
      `/api/research/stream?sessionId=${encodeURIComponent(sessionId)}&sinceSeq=${since}`;

    function connect() {
      if (closed) return;
      const since = maxSeqRef.current;
      const es = new EventSource(buildUrl(since));
      eventSource = es;
      attempt += 1;

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
          segments: prev.segments.map((s) =>
            s.id === id ? { ...s, text } : s,
          ),
        }));
      };

      const closeThinking = () => {
        inThinkingRef.current = false;
        thinkingIdRef.current = null;
      };

      const ensureRunning = () => {
        setState((prev) =>
          prev.status !== "running" ? { ...prev, status: "running" } : prev,
        );
      };

      const subagentTitleLine = (s: Subagent) =>
        `${toTitleCase(s.subagentType || "general")} Task - ${s.title || s.description || "Subagent"}`;

      const subagentToolLine = (tool: ToolEvent): string => {
        const url = (tool.input as Record<string, unknown> | undefined)?.url as
          | string
          | undefined;
        const query = (tool.input as Record<string, unknown> | undefined)
          ?.query as string | undefined;
        if (tool.tool === "webfetch" && url)
          return `${toTitleCase(tool.tool)} ${url}${tool.title && tool.title !== url ? ` (${tool.title})` : ""}`.trim();
        if (tool.tool === "websearch" && query)
          return `${toTitleCase(tool.tool)} ${tool.title || query}`.trim();
        return tool.title ?? toTitleCase(tool.tool);
      };

      const handleToolEvent = (tool: ToolEvent) => {
        const { id, tool: name, title } = tool;
        const status = tool.status ?? "running";

        toolsRef.current = {
          ...toolsRef.current,
          [id]: { ...(toolsRef.current[id] ?? tool), ...tool, status },
        };

        // child-session tools belong to the subagent's own transcript: mirror
        // them into its live segments so the subagent view updates in place.
        const childForTool = tool.sessionId
          ? Object.values(subagentsRef.current).find(
              (s) => s.childSessionId === tool.sessionId,
            )
          : undefined;
        if (childForTool && tool.seq !== undefined) {
          const base = subagentToolLine(tool);
          const text =
            status === "completed"
              ? `✓ ${base}${tool.durationMs ? ` (${formatDuration(tool.durationMs)})` : ""}`
              : status === "error"
                ? `✗ ${base}: ${tool.error ?? "error"}`
                : base;
          upsertSubagentSegment(
            childForTool.childSessionId,
            tool.seq,
            "tool",
            text,
            "replace",
          );
        }

        const prevSubagents = subagentsRef.current;
        const parentSubagent = Object.values(prevSubagents).find(
          (s) => s.id === id,
        );
        const isChildTool =
          !!tool.sessionId &&
          Object.values(prevSubagents).some(
            (s) => s.childSessionId === tool.sessionId,
          );

        if (status === "running") {
          if (isChildTool) {
            const parent = Object.values(prevSubagents).find(
              (s) => s.childSessionId === tool.sessionId,
            );
            if (parent) {
              const segId = toolSegmentsRef.current[parent.id];
              if (segId) {
                const titleLine = subagentTitleLine(parent);
                const link = subagentLink(
                  titleLine,
                  parent.childSessionId,
                  mode,
                  sessionId,
                );
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
              const parent = Object.values(prevSubagents).find(
                (s) => s.childSessionId === tool.sessionId,
              );
              if (parent) {
                const segId = toolSegmentsRef.current[parent.id];
                if (segId) {
                  const titleLine = subagentTitleLine(parent);
                  const link = subagentLink(
                    titleLine,
                    parent.childSessionId,
                    mode,
                    sessionId,
                  );
                  const toolLine = subagentToolLine(tool);
                  const prefix = tool.status === "error" ? "✗" : "✓";
                  // keep ∴ while parent still running, show last tool with status
                  replaceSegment(
                    segId,
                    `∴ ${link}\n↳ ${toolLine}${tool.status === "error" ? ` · ${tool.error}` : ""}`,
                  );
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
            const parent = Object.values(prevSubagents).find(
              (s) => s.childSessionId === tool.sessionId,
            );
            if (parent) {
              const segId = toolSegmentsRef.current[parent.id];
              if (segId) {
                const titleLine = subagentTitleLine(parent);
                const link = subagentLink(
                  titleLine,
                  parent.childSessionId,
                  mode,
                  sessionId,
                );
                const toolLine = subagentToolLine(tool);
                replaceSegment(
                  segId,
                  `∴ ${link}\n↳ ✗ ${toolLine}: ${tool.error ?? "error"}`,
                );
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

      es.addEventListener("chunk", (e) => {
        ensureRunning();
        const payload = JSON.parse(e.data) as ChunkPayload & {
          seq?: number;
          kind?: string;
        };
        closeThinking();
        if (
          typeof payload.seq === "number" &&
          payload.seq > maxSeqRef.current
        ) {
          maxSeqRef.current = payload.seq;
        }
        const kind =
          payload.kind === "tool" || payload.kind === "thinking"
            ? payload.kind
            : "text";
        appendSegment(payload.text, kind);
      });

      es.addEventListener("thinking", (e) => {
        ensureRunning();
        const { text, done, seq } = JSON.parse(e.data) as ThinkingPayload & {
          seq?: number;
        };
        if (typeof seq === "number" && seq > maxSeqRef.current) {
          maxSeqRef.current = seq;
        }

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

      es.addEventListener("status", (e) => {
        const { status } = JSON.parse(e.data) as StatusPayload;
        const normalized = normalizeStatus(status);
        if (!normalized) return;
        setState((prev) => ({
          ...prev,
          status: normalized,
        }));
      });

      es.addEventListener("tool.started", (e) => {
        ensureRunning();
        const tool = JSON.parse(e.data) as ToolEvent;
        if (typeof tool.seq === "number" && tool.seq > maxSeqRef.current) {
          maxSeqRef.current = tool.seq;
        }
        handleToolEvent({ ...tool, status: "running" });
      });

      es.addEventListener("tool.completed", (e) => {
        ensureRunning();
        const tool = JSON.parse(e.data) as ToolEvent;
        if (typeof tool.seq === "number" && tool.seq > maxSeqRef.current) {
          maxSeqRef.current = tool.seq;
        }
        handleToolEvent({ ...tool, status: "completed" });
      });

      es.addEventListener("tool.error", (e) => {
        ensureRunning();
        const tool = JSON.parse(e.data) as ToolEvent;
        if (typeof tool.seq === "number" && tool.seq > maxSeqRef.current) {
          maxSeqRef.current = tool.seq;
        }
        handleToolEvent({ ...tool, status: "error" });
      });

      es.addEventListener("subagent.started", (e) => {
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
        setSubagentLive((prev) => ({
          ...prev,
          [payload.childSessionId]: {
            id: payload.id,
            childSessionId: payload.childSessionId,
            title: payload.title,
            description: payload.description,
            subagentType: payload.subagentType,
            status: "running",
            segments: [],
          },
        }));

        // remove redundant plain text that is exactly the subagent title (e.g. "Search LinkedIn Rust jobs" before the formatted subagent block)
        setState((prev) => {
          const lastSeg = prev.segments[prev.segments.length - 1];
          const t = (payload.title || payload.description || "").trim();
          if (
            lastSeg &&
            lastSeg.kind !== "tool" &&
            lastSeg.kind !== "thinking" &&
            lastSeg.text.trim() === t
          ) {
            return { ...prev, segments: prev.segments.slice(0, -1) };
          }
          return prev;
        });

        const titleLine = subagentTitleLine(subagent);
        const link = subagentLink(
          titleLine,
          payload.childSessionId,
          mode,
          sessionId,
        );
        const segId = appendSegment(`∴ ${link}\n↳ Starting...`, "tool");
        toolSegmentsRef.current[payload.id] = segId;
      });

      es.addEventListener("subagent.chunk", (e) => {
        const { id, childSessionId, text, seq } = JSON.parse(
          e.data,
        ) as SubagentChunkPayload;
        if (text) {
          upsertSubagentSegment(
            childSessionId,
            liveSeq(seq),
            "text",
            text,
            "append",
          );
        }
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

      es.addEventListener("subagent.thinking", (e) => {
        const { childSessionId, text, seq } = JSON.parse(
          e.data,
        ) as SubagentThinkingPayload;
        if (!text) return;
        upsertSubagentSegment(
          childSessionId,
          liveSeq(seq),
          "thinking",
          text,
          "append",
        );
      });

      es.addEventListener("subagent.completed", (e) => {
        const payload = JSON.parse(e.data) as SubagentCompletedPayload;
        setSubagentLive((prev) => {
          const existing = prev[payload.childSessionId];
          if (!existing) return prev;
          return {
            ...prev,
            [payload.childSessionId]: {
              ...existing,
              status: "completed",
              title: payload.title ?? existing.title,
              description: payload.description ?? existing.description,
              subagentType: payload.subagentType ?? existing.subagentType,
            },
          };
        });
        const subagent = subagentsRef.current[payload.id];
        const segId = toolSegmentsRef.current[payload.id];
        if (!subagent || !segId) return;
        const start = subagentStartsRef.current[payload.id];
        const durationMs =
          payload.durationMs ?? (start ? Date.now() - start : undefined);
        const toolCount = Object.values(toolsRef.current).filter(
          (t) => t.sessionId === payload.childSessionId,
        ).length;
        const titleLine = subagentTitleLine({
          ...subagent,
          title: payload.title,
          description: payload.description,
          subagentType: payload.subagentType,
        } as Subagent);
        const link = subagentLink(
          titleLine,
          payload.childSessionId,
          mode,
          sessionId,
        );
        const timeTaken =
          payload.timeTaken ??
          (durationMs ? formatDuration(durationMs) : undefined);
        replaceSegment(
          segId,
          `✓ ${link}\n↳ ${toolCount} tool${toolCount === 1 ? "" : "s"}${timeTaken ? ` · ${timeTaken}` : ""}`,
        );
      });

      es.addEventListener("job", (e) => {
        ensureRunning();
        try {
          const raw = JSON.parse(e.data) as JobPayload &
            Record<string, unknown>;
          // Normalize before Zod: the server emits "" for missing
          // location/description and passes type/url through as-is, which
          // would fail StreamedJobSchema (min(1) / enum / url) and drop the
          // job from the live view even though it is persisted to the DB
          // (history path has no validation, so it appears after reload).
          const asString = (v: unknown): string =>
            typeof v === "string" ? v.trim() : "";
          const title = asString(
            (raw as { title?: unknown }).title,
          );
          const company = asString(
            (raw as { company?: unknown }).company,
          );
          if (!title || !company) return;
          const rawType = asString(
            (raw as { type?: unknown }).type,
          ).toLowerCase();
          const rawUrl = asString((raw as { url?: unknown }).url);
          let url: string | null = null;
          if (rawUrl) {
            try {
              url = new URL(rawUrl).toString();
            } catch {
              url = null;
            }
          }
          const orNull = (v: unknown): string | null => {
            const s = asString(v);
            return s ? s : null;
          };
          const normalized = {
            title,
            company,
            location: asString((raw as { location?: unknown }).location) || "Unknown",
            url,
            description:
              asString((raw as { description?: unknown }).description) ||
              "No description provided",
            salary: orNull((raw as { salary?: unknown }).salary),
            experience:
              asString((raw as { experience?: unknown }).experience) || "Mid",
            visa: orNull((raw as { visa?: unknown }).visa),
            type:
              rawType === "remote" ||
              rawType === "hybrid" ||
              rawType === "onsite"
                ? rawType
                : "remote",
            country: orNull((raw as { country?: unknown }).country),
            notes: orNull((raw as { notes?: unknown }).notes),
          };
          // client-side Zod validation + dedup (server already dedups, but re-validate)
          const parsed = StreamedJobSchema.safeParse(normalized);
          if (!parsed.success) return;
          const job: JobPayload = {
            id: String(
              (raw as { id?: unknown }).id ??
                `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            ),
            sessionId: String(
              (raw as { sessionId?: unknown }).sessionId ?? sessionId ?? "",
            ),
            seq: Number((raw as { seq?: unknown }).seq ?? 0),
            ...parsed.data,
            url: (parsed.data.url as string | null) ?? null,
            salary: parsed.data.salary ?? null,
            visa: parsed.data.visa ?? null,
            country: parsed.data.country ?? null,
            notes: parsed.data.notes ?? null,
          };
          setState((prev) => {
            // dedup by title+company+url
            const key = `${job.title.toLowerCase()}|${job.company.toLowerCase()}|${(job.url ?? "").toLowerCase()}`;
            if (
              prev.jobs.some(
                (j) =>
                  `${j.title.toLowerCase()}|${j.company.toLowerCase()}|${(j.url ?? "").toLowerCase()}` ===
                  key,
              )
            ) {
              return prev;
            }
            return { ...prev, jobs: [...prev.jobs, job] };
          });
        } catch {}
      });

      es.addEventListener("message.completed", (e) => {
        const { messageId } = JSON.parse(e.data) as MessageCompletedPayload;
        setState((prev) => ({
          ...prev,
          messageId,
        }));
      });

      es.addEventListener("error", (e: MessageEvent) => {
        const data = (
          e.data ? JSON.parse(e.data) : { message: "Connection error" }
        ) as ErrorPayload;
        closeThinking();
        closed = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        setState((prev) => ({
          ...prev,
          status: "error",
          error: data.message,
        }));
        es.close();
      });

      es.addEventListener("done", () => {
        closeThinking();
        closed = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        setState((prev) => ({
          ...prev,
          status: "completed",
        }));
        es.close();
      });

      es.onerror = () => {
        if (closed) return;
        // Transport drop (tab slept, dev restart): reconnect with fresh
        // sinceSeq so the hub replays rows committed while we were away.
        closeThinking();
        es.close();
        if (reconnectTimer) clearTimeout(reconnectTimer);
        const delay = Math.min(1000 * 2 ** Math.min(attempt, 3), 5000);
        reconnectTimer = setTimeout(() => {
          if (!closed) connect();
        }, delay);
      };
    } // end connect()

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      eventSource?.close();
    };
  }, [sessionId, mode, upsertSubagentSegment]);

  const reset = useCallback(() => {
    inThinkingRef.current = false;
    thinkingIdRef.current = null;
    toolsRef.current = {};
    toolSegmentsRef.current = {};
    subagentsRef.current = {};
    subagentStartsRef.current = {};
    setSubagentLive({});
    setState(initialState);
  }, []);

  return { ...state, subagents: subagentLive, reset };
}
