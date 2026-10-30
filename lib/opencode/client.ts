import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk";

const HOST = "127.0.0.1";
const PORT = 3211;
const BASE_URL = `http://${HOST}:${PORT}`;

// Server 2.x (`opencode serve`) protects every /api/* route with HTTP Basic
// auth (username "opencode", password from OPENCODE_SERVER_PASSWORD). Model
// discovery and sessions read through those routes, so both clients must send
// the header. The password is persisted under /tmp/opencode so an app restart
// can authenticate to the server spawned by the previous run. Verified live on
// server 2.0.32: /api/model 401s without the header and 200s with it.
const AUTH_FILE = `/tmp/opencode/opencode-keystone-${PORT}.json`;

type ServerHandle = { url: string; close: () => void };

const globalForOpencode = globalThis as unknown as {
  opencodeServer?: ServerHandle;
  opencodeServerPromise?: Promise<ServerHandle>;
  opencodeServerPassword?: string;
};

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
  try {
    mkdirSync("/tmp/opencode", { recursive: true });
    // Local process password only (localhost server we spawn ourselves).
    writeFileSync(AUTH_FILE, JSON.stringify({ port: PORT, password }), {
      flag: "w",
      mode: 0o600,
    });
  } catch (error) {
    console.warn(
      "[opencode] could not persist server password file — app restarts may lose access to the running server",
      error,
    );
  }
}

/** Choose auth for a server we did not spawn in this process. */
function adoptReusePassword(): string | undefined {
  if (globalForOpencode.opencodeServerPassword) {
    return globalForOpencode.opencodeServerPassword;
  }
  try {
    const raw = JSON.parse(readFileSync(AUTH_FILE, "utf8")) as {
      port?: number;
      password?: string;
    };
    if (raw?.port === PORT && typeof raw?.password === "string") {
      globalForOpencode.opencodeServerPassword = raw.password;
      return raw.password;
    }
  } catch {
    // No stored password — fall through.
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
      // env passthrough carries OPENCODE_SERVER_PASSWORD to the server
      { env: process.env, stdio: ["ignore", "pipe", "pipe"] },
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

function authHeaders(): Record<string, string> | undefined {
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
