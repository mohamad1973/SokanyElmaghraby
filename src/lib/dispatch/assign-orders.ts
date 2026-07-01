import "server-only";

import { getPrismaClient } from "@/lib/db";
import { driverZoneInclude } from "@/lib/dispatch/zones";
import { driverZoneMatchesShipment } from "@/lib/dispatch/zone-names";
import { geocodeAddress, optimizeRoute, type RouteStop } from "@/lib/dispatch/route-optimizer";
import { generateOtpCode, hashOtp } from "@/lib/security";
import { isInternalGovernorate, resolveFulfillmentMode } from "@/lib/shipping/bosta-zones";
import { upsertInternalShipment } from "@/lib/shipping/shipments";
import { sendDeliveryOtp } from "@/lib/whatsapp";
import type { AdminOrder } from "@/lib/orders";

function todayDateOnly() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function decimalToNumber(value: unknown) {
  return Number(value ?? 0);
}

export async function ensureInternalShipment(order: AdminOrder) {
  if (!isInternalGovernorate(order.governorate)) {
    return { ok: false as const, message: "الطلب ليس داخل نطاق القاهرة/الجيزة." };
  }

  return upsertInternalShipment(order);
}

export async function getUnassignedInternalShipments() {
  const prisma = getPrismaClient();

  if (!prisma) {
    return [];
  }

  const shipments = await prisma.shipment.findMany({
    where: {
      provider: "internal",
      status: { in: ["pending", "created"] },
      assignment: null,
    },
    orderBy: { createdAt: "asc" },
  });

  return shipments;
}

type DriverLoad = {
  driverId: number;
  orderCount: number;
  codTotal: number;
};

export async function autoAssignOrders(options?: { runDate?: Date; sendOtp?: boolean }) {
  const prisma = getPrismaClient();

  if (!prisma) {
    return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  }

  const runDate = options?.runDate || todayDateOnly();
  const shipments = await getUnassignedInternalShipments();

  if (shipments.length === 0) {
    return { ok: true as const, assigned: 0, message: "لا توجد طلبات داخلية غير مُعيّنة." };
  }

  const drivers = await prisma.driver.findMany({
    where: { isActive: true },
    include: { zones: { include: driverZoneInclude } },
  });

  if (drivers.length === 0) {
    return { ok: false as const, message: "لا يوجد مندوبون نشطون." };
  }

  const existingRuns = await prisma.deliveryRun.findMany({
    where: { runDate },
    include: { assignments: { include: { shipment: true } } },
  });

  const loadMap = new Map<number, DriverLoad>();

  for (const driver of drivers) {
    const run = existingRuns.find((item) => item.driverId === driver.id);
    const orderCount = run?.assignments.length || 0;
    const codTotal = run ? decimalToNumber(run.totalCod) : 0;
    loadMap.set(driver.id, { driverId: driver.id, orderCount, codTotal });
  }

  let assigned = 0;

  for (const shipment of shipments) {
    const cod = decimalToNumber(shipment.codAmount);
    const eligibleDrivers = drivers.filter((driver) => {
      const load = loadMap.get(driver.id)!;

      if (load.orderCount >= driver.maxOrders) {
        return false;
      }

      if (load.codTotal + cod > decimalToNumber(driver.maxCodValue)) {
        return false;
      }

      return driverZoneMatchesShipment(driver.zones, {
        governorate: shipment.governorate,
        area: shipment.area,
      });
    });

    if (eligibleDrivers.length === 0) {
      continue;
    }

    eligibleDrivers.sort((a, b) => {
      const loadA = loadMap.get(a.id)!;
      const loadB = loadMap.get(b.id)!;
      const scoreA = loadA.orderCount * 1000 + loadA.codTotal;
      const scoreB = loadB.orderCount * 1000 + loadB.codTotal;
      return scoreA - scoreB;
    });

    const selectedDriver = eligibleDrivers[0];
    const load = loadMap.get(selectedDriver.id)!;

    let run = existingRuns.find((item) => item.driverId === selectedDriver.id);

    if (!run) {
      run = await prisma.deliveryRun.create({
        data: {
          driverId: selectedDriver.id,
          runDate,
          status: "draft",
        },
        include: { assignments: { include: { shipment: true } } },
      });
      existingRuns.push(run);
    }

    const sequence = run.assignments.length + 1;
    let lat = shipment.lat ? decimalToNumber(shipment.lat) : null;
    let lng = shipment.lng ? decimalToNumber(shipment.lng) : null;

    if (!lat || !lng) {
      const geo = await geocodeAddress(shipment.addressLine, shipment.governorate, shipment.area);
      if (geo.ok) {
        lat = geo.point.lat;
        lng = geo.point.lng;
        await prisma.shipment.update({
          where: { id: shipment.id },
          data: { lat, lng },
        });
      }
    }

    const otpCode = generateOtpCode();
    const otpHash = await hashOtp(otpCode);

    const assignment = await prisma.deliveryAssignment.create({
      data: {
        runId: run.id,
        shipmentId: shipment.id,
        sequence,
        status: "pending",
        otpHash,
        lat,
        lng,
      },
    });

    if (options?.sendOtp !== false) {
      await sendDeliveryOtp(shipment.receiverPhone, shipment.wooOrderNumber, otpCode);
      await prisma.deliveryAssignment.update({
        where: { id: assignment.id },
        data: { otpSentAt: new Date(), status: "out_for_delivery" },
      });
    }

    await prisma.shipment.update({
      where: { id: shipment.id },
      data: { status: "assigned" },
    });

    await prisma.deliveryRun.update({
      where: { id: run.id },
      data: {
        totalOrders: run.assignments.length + 1,
        totalCod: decimalToNumber(run.totalCod) + cod,
        status: "assigned",
      },
    });

    load.orderCount += 1;
    load.codTotal += cod;
    loadMap.set(selectedDriver.id, load);
    run.assignments.push({ ...assignment, shipment } as never);
    assigned += 1;
  }

  return {
    ok: true as const,
    assigned,
    message: assigned > 0 ? `تم تعيين ${assigned} طلب.` : "لم يتم تعيين أي طلب (تحقق من المناطق والمندوبين).",
  };
}

export async function optimizeRunRoute(runId: number) {
  const prisma = getPrismaClient();

  if (!prisma) {
    return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  }

  const run = await prisma.deliveryRun.findUnique({
    where: { id: runId },
    include: {
      assignments: {
        include: { shipment: true },
        orderBy: { sequence: "asc" },
      },
    },
  });

  if (!run) {
    return { ok: false as const, message: "المسار غير موجود." };
  }

  const stops: RouteStop[] = run.assignments.map((assignment) => ({
    assignmentId: assignment.id,
    shipmentId: assignment.shipmentId,
    sequence: assignment.sequence,
    lat: decimalToNumber(assignment.lat ?? assignment.shipment.lat),
    lng: decimalToNumber(assignment.lng ?? assignment.shipment.lng),
    label: assignment.shipment.receiverName,
  }));

  const optimized = await optimizeRoute(stops);

  if (!optimized.ok) {
    return optimized;
  }

  await prisma.$transaction([
    ...optimized.orderedStops.map((stop) =>
      prisma.deliveryAssignment.update({
        where: { id: stop.assignmentId },
        data: { sequence: stop.sequence },
      }),
    ),
    prisma.deliveryRun.update({
      where: { id: runId },
      data: { routePolyline: optimized.polyline, status: "assigned" },
    }),
  ]);

  return { ok: true as const, polyline: optimized.polyline, stops: optimized.orderedStops };
}

export async function assignOrderToDriver(order: AdminOrder, driverId: number, options?: { sendOtp?: boolean }) {
  const prisma = getPrismaClient();

  if (!prisma) {
    return { ok: false as const, message: "قاعدة البيانات غير متصلة." };
  }

  if (resolveFulfillmentMode(order.governorate) !== "internal") {
    return { ok: false as const, message: "هذا الطلب يُدار عبر Bosta وليس المندوبين الداخليين." };
  }

  const shipmentResult = await upsertInternalShipment(order);

  if (!shipmentResult.ok) {
    return shipmentResult;
  }

  const shipment = await prisma.shipment.findUnique({
    where: { wooOrderId: order.id },
    include: { assignment: true },
  });

  if (!shipment) {
    return { ok: false as const, message: "تعذر إنشاء الشحنة الداخلية." };
  }

  if (shipment.assignment) {
    return { ok: false as const, message: "الطلب مُعيّن بالفعل لمندوب." };
  }

  const driver = await prisma.driver.findUnique({ where: { id: driverId, isActive: true } });

  if (!driver) {
    return { ok: false as const, message: "المندوب غير موجود أو غير نشط." };
  }

  const runDate = todayDateOnly();
  let run = await prisma.deliveryRun.findUnique({
    where: { driverId_runDate: { driverId, runDate } },
    include: { assignments: true },
  });

  if (!run) {
    run = await prisma.deliveryRun.create({
      data: { driverId, runDate, status: "draft" },
      include: { assignments: true },
    });
  }

  const cod = Number.parseFloat(order.total) || 0;

  if (run.assignments.length >= driver.maxOrders) {
    return { ok: false as const, message: "المندوب وصل لحد الطلبات اليومي." };
  }

  if (decimalToNumber(run.totalCod) + cod > decimalToNumber(driver.maxCodValue)) {
    return { ok: false as const, message: "المندوب وصل لحد قيمة COD اليومي." };
  }

  const otpCode = generateOtpCode();
  const otpHash = await hashOtp(otpCode);

  const assignment = await prisma.deliveryAssignment.create({
    data: {
      runId: run.id,
      shipmentId: shipment.id,
      sequence: run.assignments.length + 1,
      status: options?.sendOtp === false ? "pending" : "out_for_delivery",
      otpHash,
      otpSentAt: options?.sendOtp === false ? null : new Date(),
    },
  });

  if (options?.sendOtp !== false) {
    await sendDeliveryOtp(order.phone, order.number, otpCode);
  }

  await prisma.shipment.update({ where: { id: shipment.id }, data: { status: "assigned" } });
  await prisma.deliveryRun.update({
    where: { id: run.id },
    data: {
      totalOrders: run.assignments.length + 1,
      totalCod: decimalToNumber(run.totalCod) + cod,
      status: "assigned",
    },
  });

  return { ok: true as const, assignmentId: assignment.id };
}

export async function moveAssignment(assignmentId: number, targetDriverId: number) {
  const prisma = getPrismaClient();

  if (!prisma) {
    return { ok: false as const, message: "Database unavailable" };
  }

  const assignment = await prisma.deliveryAssignment.findUnique({
    where: { id: assignmentId },
    include: { shipment: true, run: true },
  });

  if (!assignment) {
    return { ok: false as const, message: "التعيين غير موجود." };
  }

  const runDate = assignment.run.runDate;
  let targetRun = await prisma.deliveryRun.findUnique({
    where: { driverId_runDate: { driverId: targetDriverId, runDate } },
    include: { assignments: true },
  });

  if (!targetRun) {
    targetRun = await prisma.deliveryRun.create({
      data: { driverId: targetDriverId, runDate, status: "assigned" },
      include: { assignments: true },
    });
  }

  await prisma.deliveryAssignment.update({
    where: { id: assignmentId },
    data: {
      runId: targetRun.id,
      sequence: targetRun.assignments.length + 1,
    },
  });

  return { ok: true as const };
}

export async function getDispatchBoardData(runDate = todayDateOnly()) {
  const prisma = getPrismaClient();

  if (!prisma) {
    return {
      unassigned: [],
      drivers: [],
      runs: [],
      error: "قاعدة البيانات غير متصلة.",
    };
  }

  const [unassigned, drivers, runs] = await Promise.all([
    prisma.shipment.findMany({
      where: {
        provider: "internal",
        status: { in: ["pending", "created", "assigned"] },
        assignment: null,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.driver.findMany({
      where: { isActive: true },
      include: { zones: { include: { zone: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.deliveryRun.findMany({
      where: { runDate },
      include: {
        driver: true,
        assignments: {
          include: { shipment: true },
          orderBy: { sequence: "asc" },
        },
      },
      orderBy: { id: "asc" },
    }),
  ]);

  return { unassigned, drivers, runs, error: null };
}
