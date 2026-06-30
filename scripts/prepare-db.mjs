import { execSync } from "node:child_process";

function run(command) {
  execSync(command, { stdio: "inherit" });
}

if (!process.env.DATABASE_URL) {
  console.warn("[prepare-db] DATABASE_URL is not set. Skipping prisma db push/seed.");
  process.exit(0);
}

try {
  console.log("[prepare-db] Syncing Prisma schema to MySQL (safe mode, no data loss)...");
  run("npx prisma db push");
  console.log("[prepare-db] Seeding default delivery zones if needed...");
  run("npx prisma db seed");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[prepare-db] Skipping DB sync during build: ${message}`);
  console.warn("[prepare-db] Use /admin/dispatch/setup to initialize shipping tables at runtime.");
}
