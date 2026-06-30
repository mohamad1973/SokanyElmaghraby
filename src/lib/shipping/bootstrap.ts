import "server-only";

import { getPrismaClient } from "@/lib/db";

const defaultZones = [
  { name: "مدينة نصر", governorate: "القاهرة" },
  { name: "مصر الجديدة", governorate: "القاهرة" },
  { name: "المعادي", governorate: "القاهرة" },
  { name: "حلوان", governorate: "القاهرة" },
  { name: "شبرا", governorate: "القاهرة" },
  { name: "وسط البلد", governorate: "القاهرة" },
  { name: "التجمع الخامس", governorate: "القاهرة" },
  { name: "الدقي", governorate: "الجيزة" },
  { name: "المهندسين", governorate: "الجيزة" },
  { name: "فيصل", governorate: "الجيزة" },
  { name: "6 أكتوبر", governorate: "الجيزة" },
  { name: "الهرم", governorate: "الجيزة" },
  { name: "الشيخ زايد", governorate: "الجيزة" },
  { name: "إمبابة", governorate: "الجيزة" },
];

export type ShippingBootstrapStatus = {
  databaseConfigured: boolean;
  databaseConnected: boolean;
  tablesReady: boolean;
  zoneCount: number;
  driverCount: number;
  shipmentCount: number;
  bostaConfigured: boolean;
  bostaWebhookUrl: string;
  message: string;
};

export async function ensureShippingTables(prisma: NonNullable<ReturnType<typeof getPrismaClient>>) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`Shipment\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`wooOrderId\` INT NOT NULL,
      \`wooOrderNumber\` VARCHAR(191) NOT NULL,
      \`provider\` VARCHAR(191) NOT NULL,
      \`externalId\` VARCHAR(191) NULL,
      \`trackingNumber\` VARCHAR(191) NULL,
      \`status\` VARCHAR(191) NOT NULL DEFAULT 'pending',
      \`codAmount\` DECIMAL(10, 2) NOT NULL,
      \`governorate\` VARCHAR(191) NOT NULL,
      \`area\` VARCHAR(191) NOT NULL,
      \`addressLine\` TEXT NOT NULL,
      \`receiverName\` VARCHAR(191) NOT NULL,
      \`receiverPhone\` VARCHAR(191) NOT NULL,
      \`lat\` DECIMAL(10, 7) NULL,
      \`lng\` DECIMAL(10, 7) NULL,
      \`rawPayload\` JSON NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE INDEX \`Shipment_wooOrderId_key\`(\`wooOrderId\`),
      INDEX \`Shipment_provider_idx\`(\`provider\`),
      INDEX \`Shipment_status_idx\`(\`status\`),
      INDEX \`Shipment_trackingNumber_idx\`(\`trackingNumber\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`Driver\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`name\` VARCHAR(191) NOT NULL,
      \`phone\` VARCHAR(191) NOT NULL,
      \`email\` VARCHAR(191) NULL,
      \`passwordHash\` VARCHAR(191) NOT NULL,
      \`isActive\` BOOLEAN NOT NULL DEFAULT true,
      \`maxOrders\` INT NOT NULL DEFAULT 20,
      \`maxCodValue\` DECIMAL(12, 2) NOT NULL DEFAULT 50000,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE INDEX \`Driver_phone_key\`(\`phone\`),
      UNIQUE INDEX \`Driver_email_key\`(\`email\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`DeliveryZone\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`name\` VARCHAR(191) NOT NULL,
      \`governorate\` VARCHAR(191) NOT NULL,
      \`polygon\` JSON NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX \`DeliveryZone_governorate_idx\`(\`governorate\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`DriverZone\` (
      \`driverId\` INT NOT NULL,
      \`zoneId\` INT NOT NULL,
      PRIMARY KEY (\`driverId\`, \`zoneId\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`DeliveryRun\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`driverId\` INT NOT NULL,
      \`runDate\` DATE NOT NULL,
      \`status\` VARCHAR(191) NOT NULL DEFAULT 'draft',
      \`routePolyline\` TEXT NULL,
      \`totalOrders\` INT NOT NULL DEFAULT 0,
      \`totalCod\` DECIMAL(12, 2) NOT NULL DEFAULT 0,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE INDEX \`DeliveryRun_driverId_runDate_key\`(\`driverId\`, \`runDate\`),
      INDEX \`DeliveryRun_runDate_idx\`(\`runDate\`),
      INDEX \`DeliveryRun_status_idx\`(\`status\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`DeliveryAssignment\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`runId\` INT NOT NULL,
      \`shipmentId\` INT NOT NULL,
      \`sequence\` INT NOT NULL DEFAULT 0,
      \`status\` VARCHAR(191) NOT NULL DEFAULT 'pending',
      \`otpHash\` VARCHAR(191) NULL,
      \`otpSentAt\` DATETIME(3) NULL,
      \`deliveredAt\` DATETIME(3) NULL,
      \`failReason\` TEXT NULL,
      \`lat\` DECIMAL(10, 7) NULL,
      \`lng\` DECIMAL(10, 7) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE INDEX \`DeliveryAssignment_shipmentId_key\`(\`shipmentId\`),
      INDEX \`DeliveryAssignment_runId_idx\`(\`runId\`),
      INDEX \`DeliveryAssignment_status_idx\`(\`status\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

export async function initializeShippingDatabase() {
  const prisma = getPrismaClient();

  if (!prisma) {
    return { ok: false as const, message: "DATABASE_URL غير متصل." };
  }

  await ensureShippingTables(prisma);
  const seed = await seedDefaultDeliveryZones();

  return {
    ok: true as const,
    message: seed.message,
    zonesCreated: seed.created ?? 0,
  };
}

export async function getShippingBootstrapStatus(): Promise<ShippingBootstrapStatus> {
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  const bostaConfigured = Boolean(process.env.BOSTA_API_KEY);
  const siteUrl = (process.env.NEXTAUTH_URL || "https://sokany-storefront.vercel.app").replace(/\/$/, "");
  const webhookSecret = process.env.BOSTA_WEBHOOK_SECRET || "sokany-bosta-webhook-secret";
  const bostaWebhookUrl = `${siteUrl}/api/webhooks/bosta/${webhookSecret}`;

  if (!databaseConfigured) {
    return {
      databaseConfigured: false,
      databaseConnected: false,
      tablesReady: false,
      zoneCount: 0,
      driverCount: 0,
      shipmentCount: 0,
      bostaConfigured,
      bostaWebhookUrl,
      message: "DATABASE_URL غير موجود في متغيرات البيئة.",
    };
  }

  const prisma = getPrismaClient();

  if (!prisma) {
    return {
      databaseConfigured: true,
      databaseConnected: false,
      tablesReady: false,
      zoneCount: 0,
      driverCount: 0,
      shipmentCount: 0,
      bostaConfigured,
      bostaWebhookUrl,
      message: "تعذر إنشاء اتصال Prisma.",
    };
  }

  try {
    await ensureShippingTables(prisma);

    const [zoneCount, driverCount, shipmentCount] = await Promise.all([
      prisma.deliveryZone.count(),
      prisma.driver.count(),
      prisma.shipment.count(),
    ]);

    return {
      databaseConfigured: true,
      databaseConnected: true,
      tablesReady: true,
      zoneCount,
      driverCount,
      shipmentCount,
      bostaConfigured,
      bostaWebhookUrl,
      message: "قاعدة البيانات متصلة وجاهزة.",
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown database error";

    return {
      databaseConfigured: true,
      databaseConnected: false,
      tablesReady: false,
      zoneCount: 0,
      driverCount: 0,
      shipmentCount: 0,
      bostaConfigured,
      bostaWebhookUrl,
      message: `خطأ في قاعدة البيانات: ${detail}`,
    };
  }
}

export async function seedDefaultDeliveryZones() {
  const prisma = getPrismaClient();

  if (!prisma) {
    return { ok: false as const, message: "DATABASE_URL غير متصل." };
  }

  await ensureShippingTables(prisma);

  const existing = await prisma.deliveryZone.count();

  if (existing > 0) {
    return { ok: true as const, created: 0, message: `المناطق موجودة بالفعل (${existing}).` };
  }

  await prisma.deliveryZone.createMany({ data: defaultZones });

  return {
    ok: true as const,
    created: defaultZones.length,
    message: `تم إنشاء ${defaultZones.length} منطقة للقاهرة والجيزة.`,
  };
}
