import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";
import { PrismaClient } from "../app/generated/prisma/client";

// The pooled (`-pooler.…neon.tech`) endpoint speaks WebSocket. The driver
// needs an explicit constructor under the Next.js Node runtime — without it,
// first-handshake failures surface as a bare DOM `ErrorEvent` (no message,
// unserializable across the Flight/RSC boundary). Bun/Node 24 mask this with
// a native global WebSocket; pin `ws` so behavior is identical everywhere.
// See `@prisma/adapter-neon` README and `tests/unit/db-client.test.ts`.
neonConfig.webSocketConstructor = ws;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set in the environment");
  }

  const adapter = new PrismaNeon({
    connectionString: url,
  });

  return new PrismaClient({
    adapter,
  });
}

export const db = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
