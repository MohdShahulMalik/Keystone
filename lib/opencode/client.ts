import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { connect } from "node:net";
import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk";

const HOST = "127.0.0.1";
// Port is overridable so co-locating with something on 3211 doesn't break the
// spawn. Must match any external server you point the app at.
const PORT = (() => {
  const raw = process.env.OPENCODE_PORT;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 && parsed < 65536
    ? parsed
    : 3211;
})();
const BASE_URL = `http://${HOST}:${PORT}`;

// Server 2.x (`opencode serve`) protects every /api/* route with HTTP Basic
// auth (username "opencode", password from OPENCODE_SERVER_PASSWORD). Model
// discovery and sessions read through those routes, so both clients must send
// the header. The password lives only in this process and (optionally) in the
// user's environment — it is never written to disk. A container restart kills
// the spawned server anyway, so a persisted password only bought a stale file.
//
// The spawned server gets a minimal env (see spawnEnv below) instead of the
// full app env, so app secrets (DATABASE_URL, APPLY_AGENT_TOKEN, …) are not
// visible to it.

type ServerHandle = { url: string; close: () => void };

const globalForOpencode = globalThis as unknown as {
  opencodeServer?: ServerHandle;
  opencodeServerPromise?: Promise<ServerHandle>;
  opencodeServerPassword?: string;
  opencodeServerV2?: boolean;
};

/**
 * Allowlist of variables the spawned opencode server may see. Anything not
 * matched (DATABASE_URL, APPLY_AGENT_TOKEN, BETTER_AUTH_SECRET, Google client
 * secrets, …) is withheld. Provider credentials pass through via the common
 * `*_API_KEY` / `*_API_KEY_ID` / `*_API_SECRET` suffixes, as do OPENCODE_*.
 */
const SPAWN_ENV_ALLOWLIST =
  /^(PATH|HOME|USER|LOGNAME|SHELL|LANG|LC_.*|TERM|TMPDIR|XDG_.*|OPENCODE_.*|.*_API_KEY|.*_API_KEY_ID|.*_API_SECRET)$/;

function spawnEnv(): NodeJS.ProcessEnv {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && SPAWN_ENV_ALLOWLIST.test(key)) {
      env[key] = value;
    }
  }
  return env as NodeJS.ProcessEnv;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortOpen(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host });
    const finish = (isOpen: boolean) => {
      socket.destroy();
      resolve(isOpen);
    };
    socket.setTimeout(500, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

/** Port-open ≠ responsive (prod: TCP accepted, headers never arrived).
 * Any HTTP response — even 404 — proves the server sends headers. */
async function isHttpResponsive(
  url: string,
  timeoutMs = 2500,
): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
    // Consume without throwing on status; headers arrived = responsive.
    await res.arrayBuffer().catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

async function waitForHttpReady(
  url: string,
  attempts = 6,
  delayMs = 500,
): Promise<boolean> {
  for (let i = 1; i <= attempts; i++) {
    if (await isHttpResponsive(url)) return true;
    if (i < attempts) await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

/** Password our spawned server uses (or a pre-set user env value). */
function rememberServerPassword(password: string): void {
  globalForOpencode.opencodeServerPassword = password;
}

/** Choose auth for a server we did not spawn in this process. */
function adoptReusePassword(): string | undefined {
  if (globalForOpencode.opencodeServerPassword) {
    return globalForOpencode.opencodeServerPassword;
  }
  // User-managed server honoring the documented env contract.
  if (process.env.OPENCODE_SERVER_PASSWORD) {
    const password = process.env.OPENCODE_SERVER_PASSWORD;
    globalForOpencode.opencodeServerPassword = password;
    return password;
  }
  return undefined;
}

/**
 * Spawn `opencode serve` directly instead of the SDK's createOpencodeServer:
 * the SDK resolves readiness by grepping stdout for a line starting with
 * "opencode server listening", but recent 2.x binaries print
 * "server listening on ..." WITHOUT the prefix — so the SDK times out after
 * 30s and kills a perfectly healthy server. This wrapper accepts any output
 * format and confirms readiness by polling HTTP instead of parsing stdout.
 */
function spawnOpencodeServer(): Promise<ServerHandle> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "opencode",
      ["serve", `--hostname=${HOST}`, `--port=${PORT}`],
      // Minimal allowlisted env — the server must see OPENCODE_SERVER_PASSWORD
      // (in OPENCODE_*) but not the app's database/auth secrets.
      { env: spawnEnv(), stdio: ["ignore", "pipe", "pipe"] },
    );

    // Ring-buffered output for failure diagnostics. Redact the server
    // password (the 2.x server prints it to stdout) before it reaches logs.
    let output = "";
    const collect = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.length > 8000) output = output.slice(-8000);
    };
    proc.stdout?.on("data", collect);
    proc.stderr?.on("data", collect);
    const sanitize = (text: string): string => {
      const password = process.env.OPENCODE_SERVER_PASSWORD;
      return password ? text.split(password).join("<redacted>") : text;
    };

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      finish(() => {
        proc.kill();
        reject(
          new Error(
            `opencode serve did not answer HTTP on ${BASE_URL} within 30s. ` +
              `Server output: ${sanitize(output.trim()) || "(none)"}`,
          ),
        );
      });
    }, 30_000);

    proc.on("error", (error) =>
      finish(() => {
        clearTimeout(timer);
        reject(error);
      }),
    );
    proc.on("exit", (code): void =>
      finish(() => {
        clearTimeout(timer);
        reject(
          new Error(
            `opencode serve exited before HTTP readiness (code ${code}). ` +
              `Server output: ${sanitize(output.trim()) || "(none)"}`,
          ),
        );
      }),
    );

    void (async () => {
      while (!settled) {
        if (await isHttpResponsive(BASE_URL, 2000)) {
          finish(() => {
            // Any later crash still gets logged, but can no longer reject —
            // callers hold a live client and make their own HTTP calls.
            proc.on("exit", (code) => {
              console.error(
                `[opencode] server exited after readiness (code ${code}). ` +
                  `Server output: ${sanitize(output.trim()) || "(none)"}`,
              );
            });
            resolve({
              url: BASE_URL,
              close() {
                proc.kill();
              },
            });
          });
          return;
        }
        await sleep(300);
      }
    })();
  });
}

export function authHeaders(): Record<string, string> | undefined {
  const password = globalForOpencode.opencodeServerPassword;
  if (!password) return undefined;
  return {
    authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`,
  };
}
export async function getOpencodeServer() {
  if (globalForOpencode.opencodeServer) {
    return globalForOpencode.opencodeServer;
  }

  if (await isPortOpen(PORT, HOST)) {
    const ready = await waitForHttpReady(BASE_URL);
    if (!ready) {
      console.warn(
        `[opencode] port ${PORT} open but HTTP unresponsive — server may be stuck (prior run?)`,
      );
    }
    const reusedPassword = adoptReusePassword();
    if (!reusedPassword) {
      console.warn(
        `[opencode] reusing pre-running server on ${PORT} without a known password — /api/* needs HTTP Basic auth (set OPENCODE_SERVER_PASSWORD, or clear the stale server on that port); model discovery may fall back`,
      );
    }
    const handle: ServerHandle = { url: BASE_URL, close() {} };
    globalForOpencode.opencodeServer = handle;
    return handle;
  }

  // Generate once per server lifetime; the spawn copies process.env, so the
  // server picks the password up via OPENCODE_SERVER_PASSWORD.
  const password =
    process.env.OPENCODE_SERVER_PASSWORD || randomBytes(24).toString("hex");
  process.env.OPENCODE_SERVER_PASSWORD = password;
  rememberServerPassword(password);

  if (!globalForOpencode.opencodeServerPromise) {
    const spawnPromise = spawnOpencodeServer().then((handle) => {
      globalForOpencode.opencodeServer = handle;
      return handle;
    });
    globalForOpencode.opencodeServerPromise = spawnPromise;
    spawnPromise
      .catch(() => {})
      .finally(() => {
        if (globalForOpencode.opencodeServerPromise === spawnPromise) {
          globalForOpencode.opencodeServerPromise = undefined;
        }
      });
  }

  return globalForOpencode.opencodeServerPromise;
}

/**
 * Detect which OpenCode server API generation answers on BASE_URL.
 * v2 (`opencode serve` 2.x) serves everything under /api/* as JSON and gates
 * it behind Basic auth; pre-2.x serves routes at the root (`/event`,
 * `/session/...`) and answers non-JSON (usually the web-app HTML catch-all)
 * on /api/*. Probe /api/model once per process — the same route model
 * discovery already relies on. Only definite answers are cached, so a
 * transient probe failure re-checks next call instead of pinning the wrong
 * API for the server's lifetime. (Note: 2.x mirrors nothing at
 * /api/health — authenticated requests to nonexistent routes 404 with no
 * content-type, which is why /api/model is the probe.)
 */
export async function isOpencodeServerV2(): Promise<boolean> {
  if (globalForOpencode.opencodeServerV2 !== undefined) {
    return globalForOpencode.opencodeServerV2;
  }
  try {
    const server = await getOpencodeServer();
    const res = await fetch(`${server.url}/api/model`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(2500),
    });
    const contentType = res.headers.get("content-type") ?? "";
    // v2 answers JSON (200 with auth, 401 without). A pre-2.x catch-all
    // answers HTML, and a plain 404 is never "yes", even if a proxy makes
    // it JSON.
    const isV2 =
      contentType.includes("application/json") &&
      (res.ok || res.status === 401);
    globalForOpencode.opencodeServerV2 = isV2;
    // Consume the body or the connection leaks.
    await res.arrayBuffer().catch(() => undefined);
    return isV2;
  } catch (error) {
    // Server unreachable — don't cache; callers decide their own fallback.
    console.warn(
      "[opencode] /api/model probe failed — assuming v2 (spawned server is 2.x)",
      error,
    );
    return true;
  }
}

export async function getOpencodeClient(): Promise<OpencodeClient> {
  const server = await getOpencodeServer();
  return createOpencodeClient({ baseUrl: server.url, headers: authHeaders() });
}

export async function getOpencodeClientV2() {
  const { createOpencodeClient: createV2Client } = await import(
    "@opencode-ai/sdk/v2"
  );
  const server = await getOpencodeServer();
  return createV2Client({ baseUrl: server.url, headers: authHeaders() });
}
