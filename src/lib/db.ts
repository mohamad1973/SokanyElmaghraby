import "server-only";

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

/** One MySQL connection per serverless instance. Hostinger caps new connections per hour. */
function withSingleConnection(databaseUrl: string) {
  if (/[?&]connection_limit=/.test(databaseUrl)) return databaseUrl;
  const join = databaseUrl.includes("?") ? "&" : "?";
  return `${databaseUrl}${join}connection_limit=1`;
}

export function getPrismaClient() {
  if (!isDatabaseConfigured()) {
    return null;
  }

  if (!globalForPrisma.prisma) {
    const databaseUrl = process.env.DATABASE_URL;
    globalForPrisma.prisma = databaseUrl
      ? new PrismaClient({ datasources: { db: { url: withSingleConnection(databaseUrl) } } })
      : new PrismaClient();
  }

  return globalForPrisma.prisma;
}
