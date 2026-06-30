import { execSync } from "node:child_process";

function run(command) {
  execSync(command, { stdio: "inherit" });
}

if (!process.env.DATABASE_URL) {
  console.warn("[prepare-db] DATABASE_URL is not set. Skipping prisma db push/seed.");
  process.exit(0);
}

console.log("[prepare-db] Syncing Prisma schema to MySQL...");
run("npx prisma db push");

console.log("[prepare-db] Seeding default delivery zones if needed...");
run("npx prisma db seed");
