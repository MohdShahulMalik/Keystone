// Intent: app/actions/search.ts serves history/reload.
// - getSearchSessionsWithMetaData lists a user's sessions for a mode (newest
//   first), derives missing titles, takes resultCount = max(stored, actual),
//   and lazily backfills legacy rows.
// - getSearchSessionByAnyId resolves either the DB id or the opencode id.
// - getSearchSessionHistory returns ordered segments + job results.
// - getSubagentHistory resolves a child by opencode child id OR row id and
//   returns subagent + parent + ordered segments + siblings (null when unknown).
import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  getSearchSessionByAnyId,
  getSearchSessionHistory,
  getSearchSessionsWithMetaData,
  getSubagentHistory,
} from "@/app/actions/search";
import { db } from "@/lib/db";

type MockDb = Record<string, Record<string, ReturnType<typeof mock>>>;

function stub(models: Record<string, Record<string, unknown>>) {
  for (const [model, methods] of Object.entries(models)) {
    const target = (db as unknown as Record<string, object>)[model];
    if (target) Object.assign(target, methods);
    else (db as unknown as Record<string, object>)[model] = methods as object;
  }
  return db as unknown as MockDb;
}

beforeEach(() => {
  stub({
    searchSession: {
      findMany: mock(async () => []),
      findFirst: mock(async () => null),
      findUnique: mock(async () => null),
      update: mock(async () => ({})),
    },
    researchSegment: { findMany: mock(async () => []) },
    searchResult: { findMany: mock(async () => []) },
    subagentSession: {
      findFirst: mock(async () => null),
      findMany: mock(async () => []),
    },
    subagentSegment: { findMany: mock(async () => []) },
  });
});

describe("getSearchSessionsWithMetaData", () => {
  test("filters by user + mode and orders by updatedAt desc", async () => {
    const mocked = stub({
      searchSession: {
        findMany: mock(async () => []),
        update: mock(async () => ({})),
      },
    });
    await getSearchSessionsWithMetaData("user-1", "job");
    const arg = mocked.searchSession.findMany.mock.calls[0][0] as {
      where: { userId: string; mode: string };
      orderBy: { updatedAt: string };
    };
    expect(arg.where).toEqual({ userId: "user-1", mode: "job" });
    expect(arg.orderBy).toEqual({ updatedAt: "desc" });
  });

  test("backfills null titles and returns the derived title", async () => {
    const mocked = stub({
      searchSession: {
        findMany: mock(async () => [
          {
            id: "s1",
            title: null,
            query: "Skills: Rust\nCountries: USA\nJob Types: remote",
            preferences: null,
            resultCount: 0,
            updatedAt: new Date(),
            _count: { results: 0 },
          },
        ]),
        update: mock(async () => ({})),
      },
    });
    const [row] = await getSearchSessionsWithMetaData("u", "job");
    expect(row.title).toBe("Rust · remote · USA");
    expect(mocked.searchSession.update).toHaveBeenCalled();
  });

  test("resultCount is max(stored, actual) and mismatches trigger backfill", async () => {
    const mocked = stub({
      searchSession: {
        findMany: mock(async () => [
          {
            id: "s1",
            title: "T",
            query: "",
            preferences: null,
            resultCount: 1,
            updatedAt: new Date(),
            _count: { results: 5 },
          },
        ]),
        update: mock(async () => ({})),
      },
    });
    const [row] = await getSearchSessionsWithMetaData("u", "job");
    expect(row.resultCount).toBe(5);
    expect(mocked.searchSession.update).toHaveBeenCalled();
  });

  test("leaves healthy rows untouched (no backfill writes)", async () => {
    const mocked = stub({
      searchSession: {
        findMany: mock(async () => [
          {
            id: "s1",
            title: "T",
            query: "",
            preferences: null,
            resultCount: 5,
            updatedAt: new Date(),
            _count: { results: 5 },
          },
        ]),
        update: mock(async () => ({})),
      },
    });
    await getSearchSessionsWithMetaData("u", "job");
    expect(mocked.searchSession.update).not.toHaveBeenCalled();
  });
});

describe("getSearchSessionByAnyId", () => {
  test("queries by id OR openCodeSessionId", async () => {
    const mocked = stub({
      searchSession: { findFirst: mock(async () => null) },
    });
    await getSearchSessionByAnyId("abc");
    const arg = mocked.searchSession.findFirst.mock.calls[0][0] as {
      where: { OR: unknown[] };
    };
    expect(arg.where.OR).toEqual([{ id: "abc" }, { openCodeSessionId: "abc" }]);
  });
});

describe("getSearchSessionHistory", () => {
  test("returns segments ordered by seq with results", async () => {
    const mocked = stub({
      researchSegment: {
        findMany: mock(async () => [{ seq: 1, kind: "text", text: "hi" }]),
      },
      searchResult: {
        findMany: mock(async () => [{ id: "r1", jobListingJson: {} }]),
      },
    });
    const history = await getSearchSessionHistory("db-1");
    expect(history.segments.length).toBe(1);
    expect(history.results.length).toBe(1);
    const segArg = mocked.researchSegment.findMany.mock.calls[0][0] as {
      where: { sessionId: string };
      orderBy: { seq: string };
    };
    expect(segArg.where.sessionId).toBe("db-1");
    expect(segArg.orderBy).toEqual({ seq: "asc" });
  });
});

describe("getSubagentHistory", () => {
  const subagent = {
    id: "row-1",
    sessionId: "child-opencode-1",
    parentId: "parent-db-1",
  };

  function stubFound() {
    return stub({
      subagentSession: {
        findFirst: mock(async () => subagent),
        findMany: mock(async () => []),
      },
      subagentSegment: { findMany: mock(async () => [{ seq: 1 }]) },
      searchSession: {
        findUnique: mock(async () => ({ id: "parent-db-1" })),
      },
    });
  }

  test("accepts the opencode child session id", async () => {
    const mocked = stubFound();
    const result = await getSubagentHistory("child-opencode-1");
    expect(result?.subagent.sessionId).toBe("child-opencode-1");
    const arg = mocked.subagentSession.findFirst.mock.calls[0][0] as {
      where: { OR: unknown[] };
    };
    expect(arg.where.OR).toEqual([
      { sessionId: "child-opencode-1" },
      { id: "child-opencode-1" },
    ]);
  });

  test("accepts the SubagentSession row id too", async () => {
    const result =
      await stubFound().subagentSession.findFirst.mock.calls.length;
    expect(result).toBe(0);
    const found = await getSubagentHistory("row-1");
    expect(found).not.toBeNull();
  });

  test("returns null for unknown child ids", async () => {
    stub({
      subagentSession: { findFirst: mock(async () => null) },
    });
    expect(await getSubagentHistory("nope")).toBeNull();
  });

  test("loads segments ordered by seq scoped to the child session", async () => {
    const mocked = stubFound();
    await getSubagentHistory("child-opencode-1");
    const arg = mocked.subagentSegment.findMany.mock.calls[0][0] as {
      where: { sessionId: string };
      orderBy: { seq: string };
    };
    expect(arg.where.sessionId).toBe("child-opencode-1");
    expect(arg.orderBy).toEqual({ seq: "asc" });
  });
});
