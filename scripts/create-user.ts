import { db } from "../lib/db";

async function main() {
  await db.user.upsert({
    where: { id: "maxum" },
    update: {},
    create: { id: "maxum" },
  });
  console.log("User 'maxum' ensured");
  await db.$disconnect();
}

main().catch(console.error);
