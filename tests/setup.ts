// Preload for `bun test --preload ./tests/setup.ts tests/`.
// - Dummy DATABASE_URL so `@/lib/db` can be imported without real credentials.
//   Tests stub `db.*` methods; no real DB connection is ever opened.
// - Mock `next/cache` because `revalidatePath` throws outside the Next runtime
//   ("static generation store missing"). Server-action tests assert behavior,
//   not Next internals.
import { mock } from "bun:test";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.DIRECT_DATABASE_URL ??=
  "postgresql://test:test@localhost:5432/test";

mock.module("next/cache", () => ({
  revalidatePath: (..._args: unknown[]) => {},
  revalidateTag: (..._args: unknown[]) => {},
}));
