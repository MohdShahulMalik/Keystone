// Layer 3 — live DB smoke probe (gated, read-only).
//
// Run ONLY on demand with real credentials (Bun auto-loads .env):
//   RUN_LIVE_DB=1 bun test --preload ./tests/setup.ts tests/integration/db-live-smoke.test.ts
//
// Without RUN_LIVE_DB=1 every test here skips, so default `bun test` never
// touches the network. All queries are read-only EXCEPT an updateStatus-style
// lookup of a bogus id (exercises the write path's read without mutating).
//
// What it pinpoints:
//   - cold/warm behavior: a paused Neon compute wakes in ~3-5s. The first
//     query after idle reproduces `GET /listings 500 in 4.8s
//     (application-code: 4.5s)`; reruns go warm and fast. Compare durations
//     across runs to confirm the "randomly started working" pattern.
//   - the exact live throw shape on failure (ErrorEvent vs P1001 vs timeout)
//     is printed with constructor/message/causes — paste that into the fix.
//
// NOTE: builds its OWN PrismaClient instead of importing `@/lib/db` because
// other test files permanently stub the shared `db` singleton methods.
import { describe, expect, test } from "bun:test";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@/app/generated/prisma/client";

const LIVE = process.env.RUN_LIVE_DB === "1";
const maybe = LIVE ? describe : describe.skip;

function liveClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  expect(url).toBeDefined();
  return new PrismaClient({
    adapter: new PrismaNeon({ connectionString: url as string }),
  });
}

function describeThrown(e: unknown): string {
  const rec = e as Record<string, unknown>;
  let cloned: string;
  try {
    cloned = JSON.stringify(structuredClone(e));
  } catch {
    cloned = "<uncloneable: cannot cross Flight/RSC boundary>";
  }
  return [
    `ctor=${(e as object)?.constructor?.name ?? typeof e}`,
    `instanceofError=${e instanceof Error}`,
    `message=${JSON.stringify((rec?.message as string) ?? null)}`,
    `code=${JSON.stringify((rec?.code as string) ?? null)}`,
    `cause=${JSON.stringify(rec?.cause ?? null)?.slice(0, 200)}`,
    `clone=${cloned.slice(0, 200)}`,
  ].join(" | ");
}

maybe("live db smoke (RUN_LIVE_DB=1)", () => {
  test("websocket constructor present in this runtime", () => {
    console.log(
      `[live] webSocketConstructor=${typeof (neonConfig as { webSocketConstructor?: unknown }).webSocketConstructor}, nativeWebSocket=${typeof WebSocket}`,
    );
    expect(process.env.DATABASE_URL).toBeDefined();
  });

  test("read path: findMany for user 'maxum' resolves with timing", async () => {
    const client = liveClient();
    try {
      const start = performance.now();
      let rows: unknown[] | null = null;
      let thrown: unknown = null;
      try {
        rows = await client.jobListing.findMany({
          where: { userId: "maxum" },
          orderBy: { createdAt: "desc" },
          take: 5,
        });
      } catch (e) {
        thrown = e;
      }
      const elapsed = Math.round(performance.now() - start);
      console.log(
        `[live] findMany elapsed=${elapsed}ms rows=${rows?.length ?? "THREW"}`,
      );
      if (thrown) console.log(`[live] throw shape: ${describeThrown(thrown)}`);
      if (elapsed > 3000) {
        console.log(
          `[live] SLOW (${elapsed}ms): matches a cold Neon compute wake — ` +
            `first-load 500s come from here. Rerun to compare warm timing.`,
        );
      }
      expect(thrown).toBeNull();
      expect(Array.isArray(rows)).toBe(true);
    } finally {
      await client.$disconnect().catch(() => {});
    }
  });

  test("write-path read: findUnique on bogus id returns null (no mutation)", async () => {
    const client = liveClient();
    try {
      const start = performance.now();
      let thrown: unknown = null;
      let row: unknown = "unset";
      try {
        row = await client.jobListing.findUnique({
          where: { id: "live-probe-bogus-id" },
        });
      } catch (e) {
        thrown = e;
      }
      console.log(
        `[live] findUnique elapsed=${Math.round(performance.now() - start)}ms`,
      );
      if (thrown) console.log(`[live] throw shape: ${describeThrown(thrown)}`);
      expect(thrown).toBeNull();
      expect(row).toBeNull();
    } finally {
      await client.$disconnect().catch(() => {});
    }
  });
});
