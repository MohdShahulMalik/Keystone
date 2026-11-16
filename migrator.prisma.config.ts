import { defineConfig } from "prisma/config";

// Self-contained config for the migrator stage in the production image.
// Resolves `prisma/config` from the migrator's own node_modules, and points
// at the schema/migrations copied to /app/prisma. No dotenv: env comes from
// the container runtime (compose env_file), not from a file in the image.
export default defineConfig({
  schema: "/app/prisma",
  migrations: {
    path: "/app/prisma/migrations",
  },
  datasource: {
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL,
  },
});
