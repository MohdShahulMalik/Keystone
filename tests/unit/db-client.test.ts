// Layer 1 — DB client construction diagnostics.
//
// Intent: `GET /listings 500 (application-code: 4.5s)` + bare `ErrorEvent`
// overlay comes from the Neon serverless driver failing to open its
// WebSocket. These tests pin the client-side preconditions so a broken
// setup fails here with a message instead of as an empty overlay.
//
// Per Next docs (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`):
// Server Action return values AND thrown errors are serialized into the
// Flight stream — an unserializable throw (e.g. DOM `ErrorEvent`) surfaces
// as the `resolveErrorDev` stack seen in the overlay, with no app frame.
//
// NOTE (disclaimer): tests marked PINPOINT are *expected to fail* until the
// setup is fixed. They reproduce the issue; they are not broken tests.
import { describe, expect, test } from "bun:test";
import { neonConfig } from "@neondatabase/serverless";
import { db } from "@/lib/db";

// Pure helper mirroring the PrismaNeon requirement: the pooled
// (`-pooler.…neon.tech`) endpoint speaks WebSocket/HTTP; a direct
// `postgresql://…neon.tech` host does not and hangs until timeout.
function isPooledNeonUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.includes("pooler") && parsed.hostname.endsWith("neon.tech")
    );
  } catch {
    return false;
  }
}

describe("db client construction", () => {
  test("exports a PrismaClient with the jobListing model", () => {
    expect(db).toBeDefined();
    expect(typeof db.jobListing.findMany).toBe("function");
  });

  test("PINPOINT: neon WebSocket constructor is configured for Node", () => {
    // lib/db.ts never assigns neonConfig.webSocketConstructor, so under the
    // Next.js Node runtime the driver has no WebSocket implementation and
    // throws a bare DOM ErrorEvent (no message/stack) after ~4.5s.
    // Bun masks this because it ships a native global WebSocket.
    expect(
      (neonConfig as { webSocketConstructor?: unknown }).webSocketConstructor,
    ).toBeDefined();
  });

  test("PINPOINT: `ws` is a declared dependency (not hoisting luck)", async () => {
    // node_modules/ws may exist today as a hoisted transitive dep, but
    // package.json does not declare it — a fresh/clean install can remove it.
    const pkg = await Bun.file("package.json").json();
    const deps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    };
    expect("ws" in deps).toBe(true);
  });

  test("pooled vs direct Neon URL shapes (documents the PrismaNeon requirement)", () => {
    expect(
      isPooledNeonUrl(
        "postgresql://user:pass@ep-xyz-pooler.us-east-2.aws.neon.tech/db?sslmode=require",
      ),
    ).toBe(true);
    expect(
      isPooledNeonUrl(
        "postgresql://user:pass@ep-xyz.us-east-2.aws.neon.tech/db?sslmode=require",
      ),
    ).toBe(false);
    expect(isPooledNeonUrl("not a url")).toBe(false);
  });

  test("current DATABASE_URL shape is logged for diagnosis", () => {
    const url = process.env.DATABASE_URL ?? "";
    let shape = "missing";
    if (url) {
      try {
        const parsed = new URL(url);
        shape = [
          `protocol=${parsed.protocol}`,
          `pooler=${parsed.hostname.includes("pooler")}`,
          `suffix=${parsed.hostname.split(".").slice(-2).join(".")}`,
          `sslmode=${parsed.searchParams.has("sslmode")}`,
        ].join(" ");
      } catch {
        shape = "unparseable";
      }
    }
    console.log(`[db-client] DATABASE_URL shape: ${shape}`);
    // Informational only — must not fail on the dummy URL from tests/setup.ts.
    expect(typeof shape).toBe("string");
  });

  test("missing DATABASE_URL fails fast with a clear error (not a 4.5s hang)", async () => {
    // Spawns an isolated process WITHOUT any DATABASE_URL so the lib/db.ts:10
    // guard is exercised. A fail-fast here contrasts with the 4.5s
    // application-code hang seen when the URL is set but unreachable.
    const proc = Bun.spawnSync(
      [
        "bun",
        "-e",
        "delete process.env.DATABASE_URL; delete process.env.DIRECT_DATABASE_URL; try { await import('./lib/db.ts'); console.log('NO_THROW'); } catch (e) { console.log('THREW:' + (e as Error)?.message); }",
      ],
      { env: { ...process.env, DATABASE_URL: "", DIRECT_DATABASE_URL: "" } },
    );
    const out = proc.stdout.toString();
    expect(out).toContain("THREW:DATABASE_URL is not set");
  });
});
