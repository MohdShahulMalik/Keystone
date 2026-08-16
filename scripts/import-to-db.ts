import { db } from "../lib/db";
import { readFileSync } from "fs";

async function main() {
  const jobs = JSON.parse(readFileSync("data/imported-jobs.json", "utf-8"));

  const userId = "maxum";

  const data = jobs.map((job: any) => ({
    userId,
    title: job.title,
    company: job.company,
    location: job.location,
    url: job.url ?? null,
    description: job.description,
    salary: job.salary ?? null,
    experience: job.experience,
    visa: job.visa ?? null,
    type: job.type,
    country: job.country ?? null,
    notes: job.notes ?? null,
  }));

  const BATCH_SIZE = 50;
  let imported = 0;

  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    await db.jobListing.createMany({ data: batch });
    imported += batch.length;
    console.log(`Imported ${imported}/${data.length} jobs...`);
  }

  console.log(`Successfully imported ${imported} job listings`);
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
