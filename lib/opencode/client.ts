import { connect } from "node:net";
import {
  createOpencodeClient,
  createOpencodeServer,
  type OpencodeClient,
} from "@opencode-ai/sdk";

const HOST = "127.0.0.1";
const PORT = 3211;
const BASE_URL = `http://${HOST}:${PORT}`;

type ServerHandle = Awaited<ReturnType<typeof createOpencodeServer>>;

const globalForOpencode = globalThis as unknown as {
  opencodeServer?: ServerHandle;
  opencodeServerPromise?: Promise<ServerHandle>;
};

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
async function isHttpResponsive(url: string, timeoutMs = 2500): Promise<boolean> {
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
    if (i < attempts)
      await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
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
    const handle: ServerHandle = { url: BASE_URL, close() {} };
    globalForOpencode.opencodeServer = handle;
    return handle;
  }

  if (!globalForOpencode.opencodeServerPromise) {
    const spawn = createOpencodeServer({
      hostname: HOST,
      port: PORT,
      timeout: 30_000,
    }).then((handle) => {
      globalForOpencode.opencodeServer = handle;
      return handle;
    });
    globalForOpencode.opencodeServerPromise = spawn;
    spawn
      .catch(() => {})
      .finally(() => {
        if (globalForOpencode.opencodeServerPromise === spawn) {
          globalForOpencode.opencodeServerPromise = undefined;
        }
      });
  }

  return globalForOpencode.opencodeServerPromise;
}

export async function getOpencodeClient(): Promise<OpencodeClient> {
  const server = await getOpencodeServer();
  return createOpencodeClient({ baseUrl: server.url });
}

export async function getOpencodeClientV2() {
  const { createOpencodeClient: createV2Client } = await import(
    "@opencode-ai/sdk/v2"
  );
  const server = await getOpencodeServer();
  return createV2Client({ baseUrl: server.url });
}
