/**
 * Dev/ops convenience: create (or update) a bare User row directly in the DB.
 *
 * NOTE: this creates the User row WITHOUT an auth credential, so the account
 * cannot log in via email/password or Google. It exists for seeding legacy or
 * imported data that foreign-keys to a user id. Real loginable accounts are
 * created through /signup, /login or Google OAuth.
 *
 * Usage:
 *   bun run scripts/create-user.ts --email <email> [--name <name>] [--id <id>] [--dry-run]
 *
 * `--id` is optional: pass a fixed id only when importing legacy rows that
 * reference it; otherwise let Prisma generate a cuid.
 */
import { db } from "../lib/db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseArgs(argv: string[]): {
  email: string;
  name?: string;
  id?: string;
  dryRun: boolean;
} {
  let email: string | undefined;
  let name: string | undefined;
  let id: string | undefined;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--email" || argv[i] === "-e") email = argv[++i];
    else if (argv[i] === "--name" || argv[i] === "-n") name = argv[++i];
    else if (argv[i] === "--id") id = argv[++i];
    else if (argv[i] === "--dry-run") dryRun = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!email) throw new Error("Missing required --email <email>");
  if (!EMAIL_RE.test(email)) throw new Error(`Invalid email: ${email}`);
  if (id !== undefined && !/^[a-zA-Z0-9_-]{3,64}$/.test(id)) {
    throw new Error("--id must be 3-64 characters of [a-zA-Z0-9_-]");
  }
  return { email, name, id, dryRun };
}

async function main() {
  const { email, name, id, dryRun } = parseArgs(process.argv.slice(2));

  const existing = id
    ? await db.user.findFirst({
        where: { OR: [{ id: id }, { email: email }] },
        select: { id: true, email: true },
      })
    : await db.user.findFirst({
        where: { email: email },
        select: { id: true, email: true },
      });

  if (existing) {
    console.log(
      `User already exists: id=${existing.id} email=${existing.email} — nothing to do (this script never merges logins).`,
    );
    await db.$disconnect();
    return;
  }

  if (dryRun) {
    console.log(
      `Dry-run: would create user ${email}${name ? ` (${name})` : ""} with id=${id ?? "<cuid>"}`,
    );
    await db.$disconnect();
    return;
  }

  const user = await db.user.create({
    data: {
      ...(id ? { id: id } : {}),
      email: email,
      name: name ?? email.split("@")[0],
    },
    select: { id: true, email: true, name: true },
  });
  console.log(
    `Created user: id=${user.id} email=${user.email} name=${user.name}`,
  );
  console.log("Reminder: this row has no auth credential and cannot log in.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
