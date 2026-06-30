import "server-only";

import type { AdminOrder } from "@/lib/orders";
import { getPrismaClient } from "@/lib/db";
import { resolveFulfillmentMode } from "@/lib/shipping/bosta-zones";
import { createBostaDelivery } from "@/lib/shipping/bosta-client";
import { getBostaStatusLabelAr } from "@/lib/shipping/bosta-zones";

export type ShipmentInfo = {
  id: number;
  wooOrderId: number;
  wooOrderNumber: string;
  provider: "bosta" | "internal";
  externalId: string | null;
  trackingNumber: string | null;
  status: string;
  statusLabelAr: string;
  codAmount: number;
  governorate: string;
  area: string;
  addressLine: string;
  receiverName: string;
  receiverPhone: string;
  lat: number | null;
  lng: number | null;
  lastSyncedAt: string;
};

export type OrderShippingInfo = {
  provider: "bosta" | "internal";
  trackingNumber?: string;
  bostaDeliveryId?: string;
  status?: string;
  statusLabelAr?: string;
  codAmount?: number;
  lastSyncedAt?: string;
};

function decimalToNumber(value: unknown) {
  if (value == null) {
    return 0;
  }

  return Number(value);
}

export function mapShipmentRecord(record: {
  id: number;
  wooOrderId: number;
  wooOrderNumber: string;
  provider: string;
  externalId: string | null;
  trackingNumber: string | null;
  status: string;
  codAmount: unknown;
  governorate: string;
  area: string;
  addressLine: string;
  receiverName: string;
  receiverPhone: string;
  lat: unknown;
  lng: unknown;
  updatedAt: Date;
}): ShipmentInfo {
  return {
    id: record.id,
    wooOrderId: record.wooOrderId,
    wooOrderNumber: record.wooOrderNumber,
    provider: record.provider as "bosta" | "internal",
    externalId: record.externalId,
    trackingNumber: record.trackingNumber,
    status: record.status,
    statusLabelAr: getBostaStatusLabelAr(record.status),
    codAmount: decimalToNumber(record.codAmount),
    governorate: record.governorate,
    area: record.area,
    addressLine: record.addressLine,
    receiverName: record.receiverName,
    receiverPhone: record.receiverPhone,
    lat: record.lat != null ? decimalToNumber(record.lat) : null,
    lng: record.lng != null ? decimalToNumber(record.lng) : null,
    lastSyncedAt: record.updatedAt.toISOString(),
  };
}

export async function getShipmentsByOrderIds(orderIds: number[]) {
  const prisma = getPrismaClient();

  if (!prisma || orderIds.length === 0) {
    return new Map<number, ShipmentInfo>();
  }

  const records = await prisma.shipment.findMany({
    where: { wooOrderId: { in: orderIds } },
  });

  return new Map(records.map((record) => [record.wooOrderId, mapShipmentRecord(record)]));
}

export async function getShipmentByOrderId(orderId: number) {
  const prisma = getPrismaClient();

  if (!prisma) {
    return null;
  }

  const record = await prisma.shipment.findUnique({ where: { wooOrderId: orderId } });
  return record ? mapShipmentRecord(record) : null;
}

export async function upsertInternalShipment(order: AdminOrder) {
  const prisma = getPrismaClient();

  if (!prisma) {
    return { ok: false as const, message: "قاعدة البيانات غير متصلة. أضف DATABASE_URL." };
  }

  const codAmount = Number.parseFloat(order.total) || 0;

  const record = await prisma.shipment.upsert({
    where: { wooOrderId: order.id },
    create: {
      wooOrderId: order.id,
      wooOrderNumber: order.number,
      provider: "internal",
      status: "pending",
      codAmount,
      governorate: order.governorate,
      area: order.area,
      addressLine: order.address,
      receiverName: order.customerName,
      receiverPhone: order.phone,
    },
    update: {
      wooOrderNumber: order.number,
      codAmount,
      governorate: order.governorate,
      area: order.area,
      addressLine: order.address,
      receiverName: order.customerName,
      receiverPhone: order.phone,
    },
  });

  return { ok: true as const, shipment: mapShipmentRecord(record) };
}

export async function createBostaShipmentForOrder(order: AdminOrder) {
  const prisma = getPrismaClient();

  if (!prisma) {
    return { ok: false as const, message: "قاعدة البيانات غير متصلة. أضف DATABASE_URL." };
  }

  if (resolveFulfillmentMode(order.governorate) === "internal") {
    return { ok: false as const, message: "هذا الطلب داخل القاهرة/الجيزة ويُدار عبر المندوبين الداخليين." };
  }

  const existing = await prisma.shipment.findUnique({ where: { wooOrderId: order.id } });

  if (existing?.trackingNumber) {
    return { ok: false as const, message: "يوجد شحنة Bosta مسجلة بالفعل لهذا الطلب." };
  }

  const bostaResult = await createBostaDelivery(order);

  if (!bostaResult.ok) {
    return { ok: false as const, message: bostaResult.message };
  }

  const codAmount = Number.parseFloat(order.total) || 0;

  const record = await prisma.shipment.upsert({
    where: { wooOrderId: order.id },
    create: {
      wooOrderId: order.id,
      wooOrderNumber: order.number,
      provider: "bosta",
      externalId: bostaResult.deliveryId || null,
      trackingNumber: bostaResult.trackingNumber || null,
      status: "created",
      codAmount,
      governorate: order.governorate,
      area: order.area,
      addressLine: order.address,
      receiverName: order.customerName,
      receiverPhone: order.phone,
      rawPayload: bostaResult.raw as object,
    },
    update: {
      provider: "bosta",
      externalId: bostaResult.deliveryId || null,
      trackingNumber: bostaResult.trackingNumber || null,
      status: "created",
      rawPayload: bostaResult.raw as object,
    },
  });

  return { ok: true as const, shipment: mapShipmentRecord(record), trackingNumber: bostaResult.trackingNumber };
}

export async function updateShipmentFromBostaWebhook(payload: {
  _id?: string;
  trackingNumber?: string;
  state?: { value?: string };
  businessReference?: string;
}) {
  const prisma = getPrismaClient();

  if (!prisma) {
    return { ok: false as const, message: "Database unavailable" };
  }

  const status = payload.state?.value || "unknown";
  const wooOrderId = payload.businessReference ? Number.parseInt(payload.businessReference, 10) : NaN;

  let record = null;

  if (payload.trackingNumber) {
    record = await prisma.shipment.findFirst({ where: { trackingNumber: payload.trackingNumber } });
  }

  if (!record && payload._id) {
    record = await prisma.shipment.findFirst({ where: { externalId: payload._id } });
  }

  if (!record && Number.isFinite(wooOrderId)) {
    record = await prisma.shipment.findUnique({ where: { wooOrderId } });
  }

  if (!record) {
    return { ok: false as const, message: "Shipment not found" };
  }

  const updated = await prisma.shipment.update({
    where: { id: record.id },
    data: {
      status,
      externalId: payload._id || record.externalId,
      trackingNumber: payload.trackingNumber || record.trackingNumber,
      rawPayload: payload as object,
    },
  });

  return { ok: true as const, shipment: mapShipmentRecord(updated) };
}

export function shipmentToOrderShipping(shipment: ShipmentInfo): OrderShippingInfo {
  return {
    provider: shipment.provider,
    trackingNumber: shipment.trackingNumber || undefined,
    bostaDeliveryId: shipment.externalId || undefined,
    status: shipment.status,
    statusLabelAr: shipment.statusLabelAr,
    codAmount: shipment.codAmount,
    lastSyncedAt: shipment.lastSyncedAt,
  };
}
