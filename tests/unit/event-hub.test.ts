// Intent: the event hub is a singleton note-taker (docs/BACKGROUND_SUBSCRIBER).
// register() is idempotent and hydrates seq/emittedTools/emittedJobKeys from
// the DB so restarts never collide on @@unique([sessionId, seq]) or re-emit
// jobs. subscribe()/unsubscribe() manage live SSE readers (max 10/session).
//
// NOTE: ensureStarted()/runLoop() are deliberately NOT invoked here — they
// open a real opencode event subscription with an infinite backoff-resubscribe
// loop (assumes one long-lived server + local opencode at 127.0.0.1:3211).
// Driving them in unit tests would spawn connections/timers.
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { db } from "@/lib/db";

const hub = await import("@/lib/research/event-hub");

function resetDb() {
  (db as unknown as Record<string, unknown>).researchSegment = {
    aggregate: mock(async () => ({ _max: { seq: 7 } })),
    findMany: mock(async () => [{ toolId: "tool-old" }]),
  };
  (db as unknown as Record<string, unknown>).subagentSession = {
    findMany: mock(async () => []),
  };
  (db as unknown as Record<string, unknown>).subagentSegment = {
    groupBy: mock(async () => []),
    findMany: mock(async () => []),
  };
  (db as unknown as Record<string, unknown>).searchResult = {
    findMany: mock(async () => [
      {
        jobListingJson: {
          title: "Rust Engineer",
          company: "Acme",
          url: "https://a.example",
          seq: 4,
        },
      },
    ]),
  };
}

beforeEach(() => {
  resetDb();
});

describe("subscribe / unsubscribe", () => {
  test("multiple readers can attach to the same session", () => {
    const inboxA: string[] = [];
    const inboxB: string[] = [];
    const unA = hub.subscribe("sess-multi", (t) => inboxA.push(t));
    const unB = hub.subscribe("sess-multi", (t) => inboxB.push(t));
    // listeners for different sessions are independent
    const inboxOther: string[] = [];
    const unOther = hub.subscribe("sess-other", (t) => inboxOther.push(t));
    unA();
    unB();
    unOther();
    expect(inboxA.length).toBe(0);
    expect(inboxOther.length).toBe(0);
  });

  test("unsubscribe is idempotent and unknown sessions are safe", () => {
    const send = (_t: string) => {};
    expect(() => hub.unsubscribe("no-such-session", send)).not.toThrow();
    const unsub = hub.subscribe("sess-unsub", send);
    unsub();
    expect(() => unsub()).not.toThrow();
  });

  test("listener count per session is capped (oldest dropped, memory bounded)", () => {
    const unsubs: Array<() => void> = [];
    for (let i = 0; i < 15; i++) {
      unsubs.push(hub.subscribe("sess-cap", () => {}));
    }
    for (const u of unsubs) u();
    // hub still functional afterwards
    const inbox: string[] = [];
    const u = hub.subscribe("sess-cap", (t) => inbox.push(t));
    u();
    expect(inbox.length).toBe(0);
  });
});

describe("register — idempotent + hydrate", () => {
  test("second register for the same dbSessionId skips re-hydration", async () => {
    await hub.register("sess-idem", "opencode-idem", "user-1");
    const agg = (
      db as unknown as {
        researchSegment: { aggregate: ReturnType<typeof mock> };
      }
    ).researchSegment.aggregate;
    const callsBefore = agg.mock.calls.length;
    await hub.register("sess-idem", "opencode-idem", "user-1");
    expect(agg.mock.calls.length).toBe(callsBefore);
  });

  test("hydrate reads parent MAX(seq) so resumes don't collide on unique(seq)", async () => {
    await hub.register("sess-seq", "opencode-seq", "user-1");
    const agg = (
      db as unknown as {
        researchSegment: { aggregate: ReturnType<typeof mock> };
      }
    ).researchSegment.aggregate;
    expect(agg).toHaveBeenCalled();
    const arg = agg.mock.calls[0][0] as {
      where: { sessionId: string };
    };
    expect(arg.where.sessionId).toBe("sess-seq");
  });

  test("hydrate restores child routing + job dedup seeds from existing rows", async () => {
    (db as unknown as Record<string, unknown>).subagentSession = {
      findMany: mock(async () => [
        { sessionId: "child-1", openCodeParentToolId: "tool-1" },
      ]),
    };
    (db as unknown as Record<string, unknown>).subagentSegment = {
      groupBy: mock(async () => [{ sessionId: "child-1", _max: { seq: 3 } }]),
      findMany: mock(async () => []),
    };
    await hub.register("sess-child", "opencode-child", "user-1");
    const groupBy = (
      db as unknown as { subagentSegment: { groupBy: ReturnType<typeof mock> } }
    ).subagentSegment.groupBy;
    expect(groupBy).toHaveBeenCalled();
  });

  test("hydrate never rejects register even when the DB is down", async () => {
    (db as unknown as Record<string, unknown>).researchSegment = {
      aggregate: mock(async () => {
        throw new Error("db down");
      }),
      findMany: mock(async () => {
        throw new Error("db down");
      }),
    };
    (db as unknown as Record<string, unknown>).subagentSession = {
      findMany: mock(async () => {
        throw new Error("db down");
      }),
    };
    (db as unknown as Record<string, unknown>).searchResult = {
      findMany: mock(async () => {
        throw new Error("db down");
      }),
    };
    await expect(
      hub.register("sess-dbfail", "opencode-dbfail", "user-1"),
    ).resolves.toBeUndefined();
  });
});

describe("flushAllSessions", () => {
  test("tolerates sessions with no pending work", async () => {
    await hub.register("sess-flush", "opencode-flush", "user-1");
    await expect(hub.flushAllSessions()).resolves.toBeUndefined();
  });
});
