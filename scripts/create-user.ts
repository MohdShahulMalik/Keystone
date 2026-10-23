import { db } from "../lib/db";

/**
 * Dev convenience: ensure the local placeholder user row exists.
 * Real users now come from Better Auth (signup / login / Google OAuth); this
 * script only matters for legacy local data previously keyed to `id: "maxum"`.
 *
 * Usage: bun run scripts/create-user.ts [name] [email]
 */
async function main() {
  const id = "maxum";
  const name = process.argv[2] ?? "Maxum";
  const email = process.argv[3] ?? "maxum@example.org";

  await db.user.upsert({
    where: { id: "maxum" },
    update: {},
    create: { id, name, email },
  });
  console.log(`User '${id}' ensured (${name} <${email}>)`);
  await db.$disconnect();
}

main().catch(console.error);
