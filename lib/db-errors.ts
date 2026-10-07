// Serializable DB failure helpers for server actions / server components.
//
// Background: the Neon serverless driver rejects with a bare DOM `ErrorEvent`
// (not an `Error`, empty message, `JSON.stringify` drops everything,
// `structuredClone` throws) when its WebSocket handshake dies. Thrown raw
// from a server action or component, that value cannot cross the Flight/RSC
// boundary, so Next.js renders an empty `ErrorEvent` overlay with no app
// frame. Every DB read in a `"use server"` boundary must therefore:
//
//   1. bound the wait with `withDbTimeout` (a paused Neon compute wakes in
//      ~3-5s; unbounded awaits hold the Flight stream open until the 4.5s
//      `GET /listings 500` from the incident), retry transient connectivity
//      failures with `withResilientDb` (exponential backoff, see below), and
//   2. convert failures via `classifyDbError` into plain `{ cause, code }`
//      strings that survive `structuredClone` / Flight serialization.
//
// Only connectivity failures carry a `cause`. Generic query errors stay an
// opaque `{ success: false, error }` so existing "never leak DB errors"
// behavior is preserved.

export type DbFailureKind = "db_unreachable" | "timeout";

export interface DbFailure {
  /** Stable, client-readable reason. Always a plain string. */
  cause: DbFailureKind;
  /** Prisma/driver code when one exists (e.g. `P1001`). Plain string. */
  code?: string;
}

/**
 * Per-query timeout for DB reads in server actions/components. Read from the
 * environment on every call so tests can override it without re-importing.
 *
 * Default 8000ms: warm pooled queries measure ~600-800ms and a paused Neon
 * compute wakes in ~3-5s (the incident's 4.5s hang), so the bound must clear
 * a cold wake with margin while still capping a truly dead connection.
 * A 400ms-style aggressive default starves healthy warm queries and degrades
 * the listings page to empty — do not lower it without scaling the
 * fault-injection timeout test to match.
 */
export function getDbReadTimeoutMs(): number {
  const raw = process.env.DB_READ_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && (parsed as number) > 0)
    return parsed as number;
  return 8000;
}

export class DbTimeoutError extends Error {
  readonly code = "DB_TIMEOUT";

  constructor(ms: number) {
    super(`Database query timed out after ${ms}ms`);
    this.name = "DbTimeoutError";
  }
}

/** Race `work` against a serializable timeout. Never returns non-cloneables. */
export function withDbTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DbTimeoutError(ms)), ms);
    (timer as unknown as { unref?: () => void }).unref?.();
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/** Read a symbol-keyed prop by symbol description (e.g. `kType`). */
function getSymbolProp(value: object, description: string): unknown {
  for (const sym of Object.getOwnPropertySymbols(value)) {
    if (sym.description === description) {
      return (value as Record<symbol, unknown>)[sym];
    }
  }
  return undefined;
}

function hasSymbolProp(value: object, description: string): boolean {
  return Object.getOwnPropertySymbols(value).some(
    (sym) => sym.description === description,
  );
}

/**
 * The `ws`-flavored Neon failure is NOT always `instanceof ErrorEvent`:
 * realm mismatches (undici vs DOM vs `ws` package) break `instanceof`, and
 * the diagnostics live behind symbols (`kType`/`kTarget`/`kError`/`kMessage`)
 * with an empty-string message. Duck-type it instead.
 */
function isNeonWsErrorEvent(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as Record<string | symbol, unknown>;

  try {
    if (
      typeof ErrorEvent !== "undefined" &&
      error instanceof ErrorEvent &&
      (error as ErrorEvent).type === "error"
    ) {
      return true;
    }
  } catch {
    // Cross-realm `instanceof` can throw — fall through to duck-typing.
  }

  const ctorName = (error as { constructor?: { name?: unknown } }).constructor
    ?.name;
  if (ctorName === "ErrorEvent") return true;
  if ((record as { name?: unknown }).name === "ErrorEvent") return true;

  // Symbol(kType) === "error" is the ws driver's type tag; require a second
  // signal so a random `{ type: "error" }` object is not misclassified.
  const symbolType =
    hasSymbolProp(error, "kType") && getSymbolProp(error, "kType") === "error";
  const domType =
    (record as { type?: unknown }).type === "error" ||
    (getSymbolProp(error, "kMessage") === "" && hasSymbolProp(error, "kError"));
  const wsSignals =
    typeof (record as { clientVersion?: unknown }).clientVersion === "string" ||
    hasSymbolProp(error, "kTarget") ||
    hasSymbolProp(error, "kError");
  if ((symbolType || domType) && wsSignals) return true;
  // Bare `new ErrorEvent("error")` in tests: symbol tags may be absent, but
  // the DOM type tag plus ErrorEvent ctor lineage above already matched. A
  // final fallback for runtimes where symbols are non-enumerable:
  if (
    symbolType &&
    typeof (record as { message?: unknown }).message === "string"
  ) {
    return true;
  }
  return false;
}

/** Transient TCP/TLS/DNS codes worth retrying (top-level or nested). */
const RETRYABLE_NETWORK_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENETDOWN",
  "ENETRESET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "FETCH_FAILED",
]);

/** Collect `.code` strings from the error, its `cause` chain, `.errors`,
 * and the ws driver's `Symbol(kError)` payload (single AggregateError or
 * array of Errors). Cycle-safe. */
function collectNetworkCodes(error: unknown): string[] {
  const codes: string[] = [];
  const seen = new Set<unknown>();
  const visit = (value: unknown, depth: number) => {
    if (value === null || typeof value !== "object") return;
    if (seen.has(value) || depth > 4) return;
    seen.add(value);
    const record = value as Record<string | symbol, unknown>;
    if (typeof record.code === "string") codes.push(record.code);
    const symbolError =
      typeof value === "object" && value !== null
        ? getSymbolProp(value, "kError")
        : undefined;
    for (const next of [record.cause, symbolError]) {
      if (next instanceof AggregateError) {
        const aggregateCode = (next as { code?: unknown }).code;
        if (typeof aggregateCode === "string") codes.push(aggregateCode);
        for (const sub of next.errors ?? []) visit(sub, depth + 1);
      } else if (Array.isArray(next)) {
        for (const sub of next) visit(sub, depth + 1);
      } else {
        visit(next, depth + 1);
      }
    }
    if (Array.isArray(record.errors)) {
      for (const sub of record.errors) visit(sub, depth + 1);
    }
  };
  visit(error, 0);
  return codes;
}

/** Abnormal WebSocket closure (1006 = no close frame, i.e. dropped TCP). */
function getWsCloseCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidates: unknown[] = [
    (error as Record<string, unknown>).target,
    getSymbolProp(error, "kTarget"),
  ];
  for (const target of candidates) {
    if (typeof target !== "object" || target === null) continue;
    const code = (target as Record<string, unknown>)._closeCode;
    if (typeof code === "number") return code;
    const publicCode = (target as Record<string, unknown>).closeCode;
    if (typeof publicCode === "number") return publicCode;
  }
  return undefined;
}

const PRISMA_UNREACHABLE_CODES = new Set(["P1001", "P1002", "P1008", "P1017"]);

/**
 * Map a driver throw to a serializable `{ cause, code }`, or `null` when the
 * error is not a connectivity failure (callers then keep the generic opaque
 * shape). Never returns the raw error — it may be an uncloneable ErrorEvent.
 */
export function classifyDbError(error: unknown): DbFailure | null {
  if (
    error instanceof DbTimeoutError ||
    (error as { code?: unknown })?.code === "DB_TIMEOUT"
  ) {
    return { cause: "timeout", code: "DB_TIMEOUT" };
  }
  if (isNeonWsErrorEvent(error)) {
    // Keep the stable contract: WS-shape failures report NEON_WS_ERROR even
    // when a nested TCP code (e.g. ETIMEDOUT) is also present.
    return { cause: "db_unreachable", code: "NEON_WS_ERROR" };
  }
  for (const code of collectNetworkCodes(error)) {
    if (RETRYABLE_NETWORK_CODES.has(code)) {
      return { cause: "db_unreachable", code };
    }
  }
  if (getWsCloseCode(error) === 1006) {
    return { cause: "db_unreachable", code: "NEON_WS_CLOSED_1006" };
  }
  const code =
    typeof (error as { code?: unknown })?.code === "string"
      ? ((error as { code: string }).code as string)
      : undefined;
  if (code && PRISMA_UNREACHABLE_CODES.has(code)) {
    return { cause: "db_unreachable", code };
  }
  if (error instanceof TypeError && /fetch failed/i.test(error.message)) {
    return { cause: "db_unreachable", code: "FETCH_FAILED" };
  }
  return null;
}

/**
 * Retry/backoff for transient connectivity failures.
 *
 * Only errors where `classifyDbError()` returns non-null (`db_unreachable` |
 * `timeout`) are retried — validation, P2025 races, and constraint violations
 * fail fast on the first attempt. Each attempt is individually bounded by
 * `withDbTimeout`, so the worst-case added latency is
 * `attempts * timeoutMs + backoff`.
 *
 * Defaults (overridable per-call and via env, read on every call so tests
 * can override without re-importing):
 *   - attempts: 3 (`DB_RETRY_ATTEMPTS`, clamped 1..5)
 *   - baseMs:   300 (`DB_RETRY_BASE_MS`) — doubles per retry
 *   - maxMs:    2000 (`DB_RETRY_MAX_MS`)
 * Backoff for retry N (1-indexed) is `min(maxMs, baseMs * 2^(N-1))` plus up
 * to 100ms of jitter so thundering clients do not re-hit Neon in lockstep.
 */
export interface DbRetryOptions {
  attempts?: number;
  baseMs?: number;
  maxMs?: number;
}

export function getDbRetryAttempts(): number {
  const raw = process.env.DB_RETRY_ATTEMPTS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed)) {
    return Math.min(5, Math.max(1, parsed as number));
  }
  return 3;
}

export function getDbRetryBaseMs(): number {
  const raw = process.env.DB_RETRY_BASE_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && (parsed as number) > 0) {
    return parsed as number;
  }
  return 300;
}

export function getDbRetryMaxMs(): number {
  const raw = process.env.DB_RETRY_MAX_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && (parsed as number) > 0) {
    return parsed as number;
  }
  return 2000;
}

export function computeRetryDelayMs(
  retryIndex: number,
  baseMs: number,
  maxMs: number,
): number {
  const exponential = baseMs * 2 ** Math.max(0, retryIndex - 1);
  return Math.min(maxMs, exponential);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `work()` (called fresh on every attempt so a new query/promise is
 * issued per retry) bounded by `withDbTimeout(work(), ms)`. Retries only
 * connectivity failures; rethrows the last error when attempts are exhausted
 * or the error is not retryable.
 */
export async function withResilientDb<T>(
  work: () => Promise<T>,
  ms: number,
  retry?: DbRetryOptions,
): Promise<T> {
  const attempts = retry?.attempts ?? getDbRetryAttempts();
  const baseMs = retry?.baseMs ?? getDbRetryBaseMs();
  const maxMs = retry?.maxMs ?? getDbRetryMaxMs();

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await withDbTimeout(work(), ms);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !classifyDbError(error)) throw error;
      const delayMs =
        computeRetryDelayMs(attempt, baseMs, maxMs) +
        Math.floor(Math.random() * 100);
      await sleep(delayMs);
    }
  }
  throw lastError;
}
