/**
 * Import job listings from a JSON file into the database.
 *
 * Usage:
 *   bun run scripts/import-to-db.ts --user <userId|email> --file data/imported-jobs.json [--dry-run]
 *
 * - Validates every record with the same zod schema the app uses (addJobSchema).
 * - Skips records that already exist for the user (same title+company+url).
 * - --dry-run prints what would be imported without writing.
 */
import { readFileSync } from "node:fs";
import { db } from "../lib/db";
import { addJobSchema } from "../lib/schemas/jobs";

async function resolveUserId(userRef: string): Promise<string> {
  const isEmail = userRef.includes("@");
  const user = await db.user.findFirst({
    where: isEmail ? { email: userRef } : { id: userRef },
    select: { id: true, email: true },
  });
  if (!user) {
    throw new Error(
      `No user found for ${isEmail ? "email" : "id"} '${userRef}'. Create one via signup (or scripts/create-user.ts) first.`,
    );
  }
  return user.id;
}

function parseArgs(argv: string[]): {
  user: string;
  file: string;
  dryRun: boolean;
} {
  let user: string | undefined;
  let file: string | undefined;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--user" || argv[i] === "-u") user = argv[++i];
    else if (argv[i] === "--file" || argv[i] === "-f") file = argv[++i];
    else if (argv[i] === "--dry-run") dryRun = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!user) throw new Error("Missing required --user <userId|email>");
  if (!file) throw new Error("Missing required --file <path-to-json>");
  return { user, file, dryRun };
}

async function main() {
  const { user: userRef, file, dryRun } = parseArgs(process.argv.slice(2));
  const userId = await resolveUserId(userRef);

  const raw = JSON.parse(readFileSync(file, "utf-8")) as unknown[];
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`${file} must be a non-empty JSON array`);
  }

  type ValidJob = Awaited<ReturnType<typeof addJobSchema.parseAsync>>;
  const valid: ValidJob[] = [];
  let invalid = 0;
  raw.forEach((job, index) => {
    const parsed = addJobSchema.safeParse(job);
    if (parsed.success) {
      valid.push(parsed.data);
    } else {
      invalid++;
      console.warn(
        `[skip] record ${index} (${(job as { title?: string }).title ?? "?"}): ${
          parsed.error.issues[0]?.message ?? "validation failed"
        }`,
      );
    }
  });

  // Dedupe against what the user already has (same title+company, same url or
  // both urls null).
  const existing = await db.jobListing.findMany({
    where: { userId },
    select: { title: true, company: true, url: true },
  });
  const seen = new Set(
    existing.map((job) =>
      `${job.title}::${job.company}::${job.url ?? ""}`.toLowerCase(),
    ),
  );

  const deduped = valid.filter((job) => {
    const key = `${job.title}::${job.company}::${job.url ?? ""}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(
    `${raw.length} records read: ${valid.length} valid, ${invalid} invalid, ${
      valid.length - deduped.length
    } duplicates, ${deduped.length} to import${dryRun ? " (dry-run)" : ""}`,
  );

  if (dryRun || deduped.length === 0) {
    await db.$disconnect();
    return;
  }

  const BATCH_SIZE = 50;
  let imported = 0;
  for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
    const batch = deduped.slice(i, i + BATCH_SIZE);
    await db.jobListing.createMany({
      data: batch.map((job) => ({ ...job, userId })),
    });
    imported += batch.length;
    console.log(`Imported ${imported}/${deduped.length} jobs...`);
  }
  console.log(
    `Successfully imported ${imported} job listings for user ${userId}`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
