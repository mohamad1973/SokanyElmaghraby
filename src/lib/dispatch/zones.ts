import "server-only";

import { getPrismaClient } from "@/lib/db";
import { normalizeZoneName } from "@/lib/dispatch/zone-names";

const districtInclude = {
  children: {
    orderBy: { name: "asc" as const },
  },
} as const;

const driverZoneInclude = {
  zone: {
    include: {
      children: { orderBy: { name: "asc" as const } },
      parent: true,
    },
  },
} as const;

async function findDuplicateDistrict(prisma: NonNullable<ReturnType<typeof getPrismaClient>>, name: string, governorate: string, excludeId?: number) {
  const districts = await prisma.deliveryZone.findMany({
    where: { parentId: null, governorate },
  });

  const key = normalizeZoneName(name);
  return districts.find((district) => district.id !== excludeId && normalizeZoneName(district.name) === key) || null;
}

async function findDuplicateArea(
  prisma: NonNullable<ReturnType<typeof getPrismaClient>>,
  name: string,
  parentId: number,
  excludeId?: number,
) {
  const areas = await prisma.deliveryZone.findMany({
    where: { parentId },
  });

  const key = normalizeZoneName(name);
  return areas.find((area) => area.id !== excludeId && normalizeZoneName(area.name) === key) || null;
}

export async function listDistrictsWithAreas() {
  const prisma = getPrismaClient();
  if (!prisma) return [];

  return prisma.deliveryZone.findMany({
    where: { parentId: null },
    include: districtInclude,
    orderBy: [{ governorate: "asc" }, { name: "asc" }],
  });
}

export async function listZonesForDriverForm() {
  return listDistrictsWithAreas();
}

export async function listZones() {
  const prisma = getPrismaClient();
  if (!prisma) return [];

  return prisma.deliveryZone.findMany({
    orderBy: [{ governorate: "asc" }, { name: "asc" }],
  });
}

export async function createDistrict(input: { name: string; governorate: string; polygon?: unknown }) {
  const prisma = getPrismaClient();
  if (!prisma) {
    return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  }

  const trimmedName = input.name.trim().replace(/\s+/g, " ");
  if (!trimmedName) {
    return { ok: false as const, message: "اسم الحي مطلوب." };
  }

  const duplicate = await findDuplicateDistrict(prisma, trimmedName, input.governorate);
  if (duplicate) {
    return { ok: false as const, message: "هذا الحي مسجّل بالفعل في هذه المحافظة." };
  }

  const zone = await prisma.deliveryZone.create({
    data: {
      name: trimmedName,
      governorate: input.governorate,
      parentId: null,
      polygon: input.polygon as object | undefined,
    },
    include: districtInclude,
  });

  return { ok: true as const, zone };
}

export async function createArea(input: { name: string; parentId: number; polygon?: unknown }) {
  const prisma = getPrismaClient();
  if (!prisma) {
    return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  }

  const parent = await prisma.deliveryZone.findUnique({ where: { id: input.parentId } });
  if (!parent || parent.parentId !== null) {
    return { ok: false as const, message: "الحي الأب غير موجود." };
  }

  const trimmedName = input.name.trim().replace(/\s+/g, " ");
  if (!trimmedName) {
    return { ok: false as const, message: "اسم المنطقة مطلوب." };
  }

  const duplicate = await findDuplicateArea(prisma, trimmedName, input.parentId);
  if (duplicate) {
    return { ok: false as const, message: "هذه المنطقة مسجّلة بالفعل داخل هذا الحي." };
  }

  const zone = await prisma.deliveryZone.create({
    data: {
      name: trimmedName,
      governorate: parent.governorate,
      parentId: input.parentId,
      polygon: input.polygon as object | undefined,
    },
  });

  return { ok: true as const, zone };
}

export async function createZone(input: {
  name: string;
  governorate: string;
  parentId?: number | null;
  polygon?: unknown;
}) {
  if (input.parentId) {
    return createArea({ name: input.name, parentId: input.parentId, polygon: input.polygon });
  }

  return createDistrict({ name: input.name, governorate: input.governorate, polygon: input.polygon });
}

export async function updateZone(
  id: number,
  input: { name?: string; governorate?: string; parentId?: number | null; polygon?: unknown },
) {
  const prisma = getPrismaClient();
  if (!prisma) {
    return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  }

  const existing = await prisma.deliveryZone.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false as const, message: "السجل غير موجود." };
  }

  const nextName = input.name !== undefined ? input.name.trim().replace(/\s+/g, " ") : existing.name;
  const nextGovernorate = input.governorate ?? existing.governorate;

  if (existing.parentId === null) {
    const duplicate = await findDuplicateDistrict(prisma, nextName, nextGovernorate, id);
    if (duplicate) {
      return { ok: false as const, message: "هذا الحي مسجّل بالفعل في هذه المحافظة." };
    }
  } else if (input.name !== undefined) {
    const duplicate = await findDuplicateArea(prisma, nextName, existing.parentId, id);
    if (duplicate) {
      return { ok: false as const, message: "هذه المنطقة مسجّلة بالفعل داخل هذا الحي." };
    }
  }

  const zone = await prisma.deliveryZone.update({
    where: { id },
    data: {
      name: input.name !== undefined ? nextName : undefined,
      governorate: input.governorate,
      polygon: input.polygon as object | undefined,
    },
    include: districtInclude,
  });

  return { ok: true as const, zone };
}

export async function deleteZone(id: number) {
  const prisma = getPrismaClient();
  if (!prisma) {
    return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  }

  const zone = await prisma.deliveryZone.findUnique({
    where: { id },
    include: { children: true, drivers: true },
  });

  if (!zone) {
    return { ok: false as const, message: "السجل غير موجود." };
  }

  if (zone.children.length > 0) {
    return { ok: false as const, message: "احذف المناطق الفرعية داخل هذا الحي أولاً." };
  }

  if (zone.drivers.length > 0) {
    return { ok: false as const, message: "هذا السجل مربوط بمندوب. أزل الربط من صفحة المندوبين أولاً." };
  }

  await prisma.deliveryZone.delete({ where: { id } });

  return {
    ok: true as const,
    message: zone.parentId === null ? "تم حذف الحي." : "تم حذف المنطقة.",
  };
}

export { driverZoneInclude };
