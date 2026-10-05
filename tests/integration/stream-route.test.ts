// Intent: GET /api/research/stream is replay + live fan-out.
// - 400 without sessionId.
// - Accepts either the DB id or the opencode session id; falls back to the
//   raw id with user "maxum" when the DB row is missing.
// - Boots the hub best-effort (hub failure must not fail the request).
// - Replays missed ResearchSegments (seq > sinceSeq) as chunk/thinking/tool
//   events, child SubagentSegments as subagent.* events, SearchResults as job
//   events, then status+done for terminal sessions (no done while running).
// - Buffers hub output during replay and flushes it after, preserving order.
import { beforeEach, describe, expect, mock, test } from "bun:test";

const ensureStarted = mock(async () => {});
const register = mock(async (..._a: unknown[]) => {});
let liveSend: ((text: string) => void) | null = null;
const hubUnsub = mock(() => {});
const subscribe = mock((_id: string, send: (t: string) => void) => {
  liveSend = send;
  return hubUnsub;
});
mock.module("@/lib/research/event-hub", () => ({
  ensureStarted,
  register,
  subscribe,
}));

const { db } = await import("@/lib/db");
const route = await import("@/app/api/research/stream/route");

function stub(models: Record<string, Record<string, unknown>>) {
  for (const [model, methods] of Object.entries(models)) {
    const target = (db as unknown as Record<string, object>)[model];
    if (target) Object.assign(target, methods);
    else (db as unknown as Record<string, object>)[model] = methods as object;
  }
}

function req(query: string) {
  return {
    nextUrl: { searchParams: new URLSearchParams(query) },
  } as unknown as Parameters<typeof route.GET>[0];
}

async function readSse(res: Response, waitMs = 300): Promise<string> {
  const body = res.body;
  if (!body) throw new Error("expected a response body");
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  const deadline = Date.now() + waitMs;
  try {
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const next = await Promise.race([
        reader.read(),
        new Promise<"timeout">((r) =>
          setTimeout(() => r("timeout"), remaining),
        ),
      ]);
      if (next === "timeout") break;
      if (next.done) break;
      out += decoder.decode(next.value, { stream: true });
      // replay is finite and fast; stop once terminal markers arrive
      if (out.includes("event: done")) break;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {}
  }
  return out;
}

const baseSession = {
  id: "db-1",
  openCodeSessionId: "opencode-1",
  userId: "user-1",
};

beforeEach(() => {
  ensureStarted.mockClear();
  register.mockClear();
  subscribe.mockClear();
  hubUnsub.mockClear();
  liveSend = null;
  stub({
    searchSession: {
      findFirst: mock(async () => ({ ...baseSession })),
      findUnique: mock(async () => ({ status: "completed" })),
    },
    researchSegment: { findMany: mock(async () => []) },
    subagentSession: { findMany: mock(async () => []) },
    searchResult: { findMany: mock(async () => []) },
    subagentSegment: { findMany: mock(async () => []) },
  });
});

describe("GET validation + session resolution", () => {
  test("returns 400 without sessionId", async () => {
    const res = await route.GET(req(""));
    expect(res.status).toBe(400);
  });

  test("boots the hub and registers the resolved session", async () => {
    const res = await route.GET(req("sessionId=db-1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    expect(ensureStarted).toHaveBeenCalled();
    expect(register).toHaveBeenCalledWith("db-1", "opencode-1", "user-1");
    await readSse(res);
  });

  test("resolves via openCodeSessionId as well", async () => {
    const res = await route.GET(req("sessionId=opencode-1"));
    expect(register).toHaveBeenCalledWith("db-1", "opencode-1", "user-1");
    await readSse(res);
  });

  test("falls back to raw id + maxum when the DB row is missing", async () => {
    stub({ searchSession: { findFirst: mock(async () => null) } });
    const res = await route.GET(req("sessionId=unknown-id"));
    expect(register).toHaveBeenCalledWith("unknown-id", "unknown-id", "maxum");
    await readSse(res);
  });

  test("hub boot failure still returns a working stream", async () => {
    ensureStarted.mockImplementationOnce(async () => {
      throw new Error("hub down");
    });
    const res = await route.GET(req("sessionId=db-1"));
    expect(res.status).toBe(200);
    const body = await readSse(res);
    expect(typeof body).toBe("string");
  });
});

describe("replay semantics", () => {
  test("replays text/thinking/tool segments with sinceSeq filtering", async () => {
    stub({
      researchSegment: {
        findMany: mock(async (args: unknown) => {
          const { where } = args as { where: { seq: { gt: number } } };
          const all = [
            { seq: 1, kind: "text", text: "hello", toolId: null },
            { seq: 2, kind: "thinking", text: "hmm", toolId: null },
            { seq: 3, kind: "tool", text: "✓ Webfetch (1s)", toolId: "t1" },
          ];
          return all.filter((s) => s.seq > where.seq.gt);
        }),
      },
    });
    const res = await route.GET(req("sessionId=db-1&sinceSeq=1"));
    const body = await readSse(res);
    expect(body).not.toContain('"text":"hello"'); // seq 1 filtered
    expect(body).toContain("event: thinking");
    expect(body).toContain("event: chunk");
    expect(body).toContain("t1"); // tool row carries toolId
  });

  test("treats invalid/negative sinceSeq as 0 (full replay)", async () => {
    const findMany = mock(async () => []);
    stub({ researchSegment: { findMany } });
    for (const q of [
      "sessionId=db-1&sinceSeq=abc",
      "sessionId=db-1&sinceSeq=-5",
    ]) {
      const res = await route.GET(req(q));
      await readSse(res);
    }
    for (const call of findMany.mock.calls) {
      const args = call[0] as { where: { seq: { gt: number } } };
      expect(args.where.seq.gt).toBe(0);
    }
  });

  test("replays child segments as subagent.* events", async () => {
    stub({
      subagentSession: {
        findMany: mock(async () => [{ sessionId: "child-1" }]),
      },
      subagentSegment: {
        findMany: mock(async () => [
          { sessionId: "child-1", seq: 1, kind: "text", text: "child work" },
        ]),
      },
    });
    const res = await route.GET(req("sessionId=db-1"));
    const body = await readSse(res);
    expect(body).toContain("event: subagent.chunk");
    expect(body).toContain("child-1");
  });

  test("replays stored jobs and emits done for terminal sessions", async () => {
    stub({
      searchResult: {
        findMany: mock(async () => [
          { jobListingJson: { title: "T", seq: 1 } },
        ]),
      },
      searchSession: {
        findFirst: mock(async () => ({ ...baseSession })),
        findUnique: mock(async () => ({ status: "completed" })),
      },
    });
    const res = await route.GET(req("sessionId=db-1"));
    const body = await readSse(res);
    expect(body).toContain("event: job");
    expect(body).toContain("event: done");
  });

  test("emits no done while the session is still running", async () => {
    stub({
      searchSession: {
        findFirst: mock(async () => ({ ...baseSession })),
        findUnique: mock(async () => ({ status: "running" })),
      },
    });
    const res = await route.GET(req("sessionId=db-1"));
    const body = await readSse(res, 200);
    expect(body).not.toContain("event: done");
  });

  test("INTENT: live hub output during replay must arrive BEFORE done", async () => {
    // Order guarantee promised by the route: replay rows first, then anything
    // the hub fanned out while querying. Currently `status`+`done` for a
    // terminal session are pushed BEFORE liveBuffer drains (route.ts replay
    // block runs before the finally-flush), so a client that closes on `done`
    // — exactly what useResearchStream does — drops in-flight output.
    // This test documents intent and FAILS against the current ordering.
    stub({
      researchSegment: {
        findMany: mock(async () => [
          { seq: 1, kind: "text", text: "replayed", toolId: null },
        ]),
      },
      searchSession: {
        findFirst: mock(async () => ({ ...baseSession })),
        findUnique: mock(async () => ({ status: "completed" })),
      },
    });
    const res = await route.GET(req("sessionId=db-1"));
    liveSend?.('event: chunk\ndata: {"text":"live","seq":99}\n\n');
    // read past `done` (fixed window) so post-done output is observable
    const streamBody = res.body;
    if (!streamBody) throw new Error("expected a response body");
    const reader = streamBody.getReader();
    const decoder = new TextDecoder();
    let body = "";
    try {
      const end = Date.now() + 500;
      while (Date.now() < end) {
        const next = await Promise.race([
          reader.read(),
          new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 150)),
        ]);
        if (next === "timeout") break;
        if (next.done) break;
        body += decoder.decode(next.value, { stream: true });
      }
    } finally {
      try {
        await reader.cancel();
      } catch {}
    }
    expect(body).toContain("replayed");
    expect(body).toContain("live");
    expect(body.indexOf("replayed")).toBeLessThan(body.indexOf("live"));
    expect(body.indexOf("live")).toBeLessThan(body.indexOf("event: done"));
  });
});
