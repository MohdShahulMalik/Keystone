import { db } from "../lib/db";

async function main() {
  await db.user.create({ data: { id: "maxum" } });
  console.log("User 'maxum' created");
  await db.$disconnect();
}

main().catch(console.error);
