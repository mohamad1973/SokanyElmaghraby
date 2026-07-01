import "server-only";

import { getPrismaClient } from "@/lib/db";
import { driverZoneInclude } from "@/lib/dispatch/zones";
import { hashPassword, verifyPassword } from "@/lib/security";

export {
  createArea,
  createDistrict,
  createZone,
  deleteZone,
  listDistrictsWithAreas,
  listZones,
  listZonesForDriverForm,
  updateZone,
} from "@/lib/dispatch/zones";

export async function listDrivers() {
  const prisma = getPrismaClient();
  if (!prisma) return [];

  return prisma.driver.findMany({
    include: { zones: { include: driverZoneInclude } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getDriverByPhone(phone: string) {
  const prisma = getPrismaClient();
  if (!prisma) return null;

  return prisma.driver.findUnique({
    where: { phone },
    include: { zones: { include: driverZoneInclude } },
  });
}

export async function getDriverById(id: number) {
  const prisma = getPrismaClient();
  if (!prisma) return null;

  return prisma.driver.findUnique({
    where: { id },
    include: { zones: { include: driverZoneInclude } },
  });
}

export async function createDriver(input: {
  name: string;
  phone: string;
  email?: string;
  password: string;
  maxOrders?: number;
  maxCodValue?: number;
  zoneIds?: number[];
}) {
  const prisma = getPrismaClient();
  if (!prisma) {
    return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  }

  const passwordHash = await hashPassword(input.password);

  const driver = await prisma.driver.create({
    data: {
      name: input.name,
      phone: input.phone,
      email: input.email || null,
      passwordHash,
      maxOrders: input.maxOrders ?? 20,
      maxCodValue: input.maxCodValue ?? 50000,
      zones: input.zoneIds?.length
        ? {
            create: input.zoneIds.map((zoneId) => ({ zoneId })),
          }
        : undefined,
    },
  });

  return { ok: true as const, driver };
}

export async function updateDriver(
  id: number,
  input: {
    name?: string;
    phone?: string;
    email?: string;
    password?: string;
    isActive?: boolean;
    maxOrders?: number;
    maxCodValue?: number;
    zoneIds?: number[];
  },
) {
  const prisma = getPrismaClient();
  if (!prisma) {
    return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  }

  const data: Record<string, unknown> = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.email !== undefined) data.email = input.email || null;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.maxOrders !== undefined) data.maxOrders = input.maxOrders;
  if (input.maxCodValue !== undefined) data.maxCodValue = input.maxCodValue;
  if (input.password) data.passwordHash = await hashPassword(input.password);

  const driver = await prisma.driver.update({ where: { id }, data });

  if (input.zoneIds) {
    await prisma.driverZone.deleteMany({ where: { driverId: id } });
    if (input.zoneIds.length > 0) {
      await prisma.driverZone.createMany({
        data: input.zoneIds.map((zoneId) => ({ driverId: id, zoneId })),
      });
    }
  }

  return { ok: true as const, driver };
}

export async function authenticateDriver(phone: string, password: string) {
  const driver = await getDriverByPhone(phone);

  if (!driver || !driver.isActive) {
    return null;
  }

  const valid = await verifyPassword(password, driver.passwordHash);

  if (!valid) {
    return null;
  }

  return driver;
}

export async function getDriverReports(from: Date, to: Date) {
  const prisma = getPrismaClient();
  if (!prisma) return [];

  const runs = await prisma.deliveryRun.findMany({
    where: {
      runDate: { gte: from, lte: to },
    },
    include: {
      driver: true,
      assignments: true,
    },
  });

  const reportMap = new Map<
    number,
    {
      driverId: number;
      driverName: string;
      totalRuns: number;
      totalAssignments: number;
      delivered: number;
      failed: number;
      codTotal: number;
    }
  >();

  for (const run of runs) {
    const existing = reportMap.get(run.driverId) || {
      driverId: run.driverId,
      driverName: run.driver.name,
      totalRuns: 0,
      totalAssignments: 0,
      delivered: 0,
      failed: 0,
      codTotal: 0,
    };

    existing.totalRuns += 1;
    existing.totalAssignments += run.assignments.length;
    existing.delivered += run.assignments.filter((item) => item.status === "delivered").length;
    existing.failed += run.assignments.filter((item) => item.status === "failed").length;
    existing.codTotal += Number(run.totalCod);

    reportMap.set(run.driverId, existing);
  }

  return Array.from(reportMap.values());
}
