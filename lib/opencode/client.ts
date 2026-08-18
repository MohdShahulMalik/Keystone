import { createOpencode } from "@opencode-ai/sdk";

let serverInstance: Awaited<ReturnType<typeof createOpencode>> | null = null;

export async function getOpencodeServer() {
  if (serverInstance) return serverInstance;

  serverInstance = await createOpencode({
    hostname: "127.0.0.1",
    port: 3211,
  });

  return serverInstance;
}

export async function getOpencodeClient() {
  const server = await getOpencodeServer();

  return server.client;
}
