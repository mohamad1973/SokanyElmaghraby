import "server-only";

import type { CsChecklistAnswerInput } from "@/lib/cs/checklist";
import { getPrismaClient } from "@/lib/db";
import {
  createCsBostaDelivery,
  fetchCsBostaDelivery,
  findBostaDeliveryByOrderReference,
  readBostaLiveDetails,
  readBostaShippingFee,
  readBostaStatus,
  updateCsBostaDelivery,
  type CsBostaParty,
} from "@/lib/shipping/bosta-client";
import { bostaStatusLocksEdits, getBostaStatusLabelAr, normalizeBostaStatus } from "@/lib/shipping/bosta-zones";

type Snapshot = Record<string, unknown> | null;

export type BostaWaybillState = {
  trackingNumber: string | null;
  bostaStatus: string | null;
  bostaStatusLabel: string | null;
  bostaShippingFee: number | null;
  bostaSyncedAt: string | null;
  bostaSyncError: string | null;
  message: string | null;
  cod: number | null;
  lastEvent: string | null;
};

function textOf(answers: CsChecklistAnswerInput[], key: string) {
  const item = answers.find((answer) => answer.itemKey === key);
  return String(item?.value || "").trim();
}

function altPhone(answers: CsChecklistAnswerInput[]) {
  const item = answers.find((answer) => answer.itemKey === "alt_phone");
  if (!item) return "";
  if (item.yesNo === "no" || item.value === "no") return "";
  return String(item.note || "").trim();
}

function partyFromAnswers(input: {
  answers: CsChecklistAnswerInput[];
  snapshot: Snapshot;
  wooOrderId: number;
  wooOrderNumber: string;
}): { ok: true; party: CsBostaParty } | { ok: false; message: string } {
  const snap = input.snapshot || {};
  const name = textOf(input.answers, "customer_name") || String(snap.customerName || "").trim();
  const phone = textOf(input.answers, "primary_phone") || String(snap.phone || "").trim();
  const address = textOf(input.answers, "address_complete") || String(snap.address || "").trim();
  const governorate = textOf(input.answers, "governorate_confirm") || String(snap.governorate || "").trim();
  const area = textOf(input.answers, "area_confirm") || String(snap.area || "").trim();
  const landmarks = textOf(input.answers, "address_landmarks");
  if (!name || !phone || !address || !governorate) {
    return { ok: false, message: "بيانات البوليصة ناقصة: الاسم أو التليفون أو العنوان أو المحافظة." };
  }
  const paymentState = String(snap.paymentState || "");
  const total = Number(String(snap.total || "").replace(/,/g, ""));
  const cod = paymentState === "paid" ? 0 : Number.isFinite(total) ? total : 0;
  return {
    ok: true,
    party: {
      name,
      phone,
      secondPhone: altPhone(input.answers) || undefined,
      governorate,
      area,
      address,
      landmarks,
      cod,
      reference: String(input.wooOrderId),
      notes: [`طلب #${input.wooOrderNumber}`, landmarks].filter(Boolean).join(" — "),
    },
  };
}

function present(input: {
  trackingNumber?: string | null;
  bostaStatus?: string | null;
  bostaShippingFee?: number | null;
  bostaSyncedAt?: Date | string | null;
  bostaSyncError?: string | null;
  message?: string | null;
  cod?: number | null;
  lastEvent?: string | null;
}): BostaWaybillState {
  const status = input.bostaStatus ? normalizeBostaStatus(input.bostaStatus) : null;
  const synced =
    input.bostaSyncedAt instanceof Date
      ? input.bostaSyncedAt.toISOString()
      : input.bostaSyncedAt || null;
  return {
    trackingNumber: input.trackingNumber || null,
    bostaStatus: status,
    bostaStatusLabel: status ? getBostaStatusLabelAr(status) : null,
    bostaShippingFee: input.bostaShippingFee ?? null,
    bostaSyncedAt: synced,
    bostaSyncError: input.bostaSyncError || null,
    message: input.message || null,
    cod: input.cod ?? null,
    lastEvent: input.lastEvent || null,
  };
}

async function rememberShipment(input: {
  wooOrderId: number;
  wooOrderNumber: string;
  trackingNumber: string | null;
  deliveryId?: string | null;
  status: string | null;
  party: CsBostaParty;
  raw?: unknown;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return;
  try {
    await prisma.shipment.upsert({
      where: { wooOrderId: input.wooOrderId },
      create: {
        wooOrderId: input.wooOrderId,
        wooOrderNumber: input.wooOrderNumber,
        provider: "bosta",
        externalId: input.deliveryId || null,
        trackingNumber: input.trackingNumber,
        status: input.status || "created",
        codAmount: input.party.cod,
        governorate: input.party.governorate,
        area: input.party.area || input.party.governorate,
        addressLine: input.party.address,
        receiverName: input.party.name,
        receiverPhone: input.party.phone,
        rawPayload: (input.raw as object) || undefined,
      },
      update: {
        provider: "bosta",
        externalId: input.deliveryId || undefined,
        trackingNumber: input.trackingNumber || undefined,
        status: input.status || undefined,
        governorate: input.party.governorate,
        area: input.party.area || input.party.governorate,
        addressLine: input.party.address,
        receiverName: input.party.name,
        receiverPhone: input.party.phone,
        rawPayload: (input.raw as object) || undefined,
      },
    });
  } catch (error) {
    console.warn("[cs] bosta shipment mirror:", error);
  }
}

async function writeConfirmation(input: {
  confirmationId: number;
  snapshot: Snapshot;
  trackingNumber: string | null;
  bostaStatus: string | null;
  bostaShippingFee: number | null;
  bostaSyncError: string | null;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return;
  const snap = { ...(input.snapshot || {}), trackingNumber: input.trackingNumber };
  await prisma.csOrderConfirmation.update({
    where: { id: input.confirmationId },
    data: {
      trackingNumber: input.trackingNumber,
      bostaStatus: input.bostaStatus,
      bostaShippingFee: input.bostaShippingFee,
      bostaSyncedAt: new Date(),
      bostaSyncError: input.bostaSyncError ? input.bostaSyncError.slice(0, 255) : null,
      customerSnapshot: snap,
    } as never,
  });
}

async function persistLinkedDelivery(input: {
  confirmationId: number;
  wooOrderId: number;
  wooOrderNumber: string;
  snapshot: Snapshot;
  answers: CsChecklistAnswerInput[];
  found: {
    trackingNumber: string;
    deliveryId: string | null;
    status: string | null;
    shippingFee: number | null;
    cod: number | null;
    lastEvent: string | null;
  };
}): Promise<BostaWaybillState> {
  const status = normalizeBostaStatus(input.found.status || "created");
  await writeConfirmation({
    confirmationId: input.confirmationId,
    snapshot: input.snapshot,
    trackingNumber: input.found.trackingNumber,
    bostaStatus: status,
    bostaShippingFee: input.found.shippingFee,
    bostaSyncError: null,
  });
  const built = partyFromAnswers({
    answers: input.answers,
    snapshot: input.snapshot,
    wooOrderId: input.wooOrderId,
    wooOrderNumber: input.wooOrderNumber,
  });
  if (built.ok) {
    await rememberShipment({
      wooOrderId: input.wooOrderId,
      wooOrderNumber: input.wooOrderNumber,
      trackingNumber: input.found.trackingNumber,
      deliveryId: input.found.deliveryId,
      status,
      party: built.party,
    });
  }
  return present({
    trackingNumber: input.found.trackingNumber,
    bostaStatus: status,
    bostaShippingFee: input.found.shippingFee,
    message: "تم ربط بوليصة بوسطة الموجودة.",
    bostaSyncedAt: new Date(),
    cod: input.found.cod,
    lastEvent: input.found.lastEvent,
  });
}

export async function attachBostaWaybillByOrderReference(input: {
  confirmationId: number;
  wooOrderId: number;
  wooOrderNumber: string;
  snapshot: Snapshot;
  knownTracking?: string | null;
}): Promise<boolean> {
  const knownTracking = String(input.knownTracking || "").trim();
  if (knownTracking) {
    const live = await fetchCsBostaDelivery(knownTracking);
    const details = live.ok ? readBostaLiveDetails(live.data) : null;
    await persistLinkedDelivery({
      ...input,
      answers: [],
      found: {
        trackingNumber: details?.trackingNumber || knownTracking,
        deliveryId: details?.deliveryId || null,
        status: details?.status || null,
        shippingFee: details?.shippingFee ?? null,
        cod: details?.cod ?? null,
        lastEvent: details?.lastEvent || null,
      },
    });
    return true;
  }
  const lookup = await findBostaDeliveryByOrderReference({
    wooOrderId: input.wooOrderId,
    wooOrderNumber: input.wooOrderNumber,
  });
  if (!lookup.details?.trackingNumber) {
    await writeConfirmation({
      confirmationId: input.confirmationId,
      snapshot: input.snapshot,
      trackingNumber: null,
      bostaStatus: null,
      bostaShippingFee: null,
      bostaSyncError: "مفيش بوليصة على بوسطة برقم مرجعي مطابق لرقم الأوردر.",
    });
    return false;
  }
  await persistLinkedDelivery({
    ...input,
    answers: [],
    found: {
      trackingNumber: lookup.details.trackingNumber,
      deliveryId: lookup.details.deliveryId,
      status: lookup.details.status,
      shippingFee: lookup.details.shippingFee,
      cod: lookup.details.cod,
      lastEvent: lookup.details.lastEvent,
    },
  });
  return true;
}

async function linkExistingBostaDelivery(input: {
  confirmationId: number;
  wooOrderId: number;
  wooOrderNumber: string;
  snapshot: Snapshot;
  answers: CsChecklistAnswerInput[];
}): Promise<BostaWaybillState | null> {
  const byOrder = await findBostaDeliveryByOrderReference({
    wooOrderId: input.wooOrderId,
    wooOrderNumber: input.wooOrderNumber,
  });
  if (byOrder.details?.trackingNumber) {
    return persistLinkedDelivery({
      ...input,
      found: {
        trackingNumber: byOrder.details.trackingNumber,
        deliveryId: byOrder.details.deliveryId,
        status: byOrder.details.status,
        shippingFee: byOrder.details.shippingFee,
        cod: byOrder.details.cod,
        lastEvent: byOrder.details.lastEvent,
      },
    });
  }
  const message = byOrder.error || "مفيش بوليصة على بوسطة برقم مرجعي مطابق لرقم الأوردر.";
  await writeConfirmation({
    confirmationId: input.confirmationId,
    snapshot: input.snapshot,
    trackingNumber: null,
    bostaStatus: null,
    bostaShippingFee: null,
    bostaSyncError: message,
  });
  return present({
    trackingNumber: null,
    bostaSyncError: message,
    message,
    bostaSyncedAt: new Date(),
  });
}

export async function syncCsBostaWaybill(input: {
  confirmationId: number;
  wooOrderId: number;
  wooOrderNumber: string;
  shippingCompany: string | null;
  trackingNumber: string | null;
  bostaStatus: string | null;
  bostaShippingFee: number | null;
  answers: CsChecklistAnswerInput[];
  snapshot: Snapshot;
}): Promise<BostaWaybillState> {
  if (input.shippingCompany !== "bosta") {
    return present({ trackingNumber: input.trackingNumber, bostaStatus: input.bostaStatus, bostaShippingFee: input.bostaShippingFee });
  }

  let trackingNumber = input.trackingNumber;
  let bostaStatus = input.bostaStatus;
  let bostaShippingFee = input.bostaShippingFee;
  if (!trackingNumber) {
    const linked = await linkExistingBostaDelivery(input);
    if (linked?.trackingNumber) {
      trackingNumber = linked.trackingNumber;
      bostaStatus = linked.bostaStatus;
      bostaShippingFee = linked.bostaShippingFee;
    }
  }

  const built = partyFromAnswers(input);
  if (!built.ok) {
    await writeConfirmation({
      confirmationId: input.confirmationId,
      snapshot: input.snapshot,
      trackingNumber,
      bostaStatus,
      bostaShippingFee,
      bostaSyncError: built.message,
    });
    return present({
      trackingNumber,
      bostaStatus,
      bostaShippingFee,
      bostaSyncError: built.message,
      message: built.message,
      bostaSyncedAt: new Date(),
    });
  }

  if (trackingNumber && bostaStatusLocksEdits(bostaStatus)) {
    const message = "تم حفظ التعديل هنا. بوسطة قفلت تعديل البوليصة بعد استلام المندوب.";
    await writeConfirmation({
      confirmationId: input.confirmationId,
      snapshot: input.snapshot,
      trackingNumber,
      bostaStatus,
      bostaShippingFee,
      bostaSyncError: message,
    });
    return present({
      trackingNumber,
      bostaStatus,
      bostaShippingFee,
      bostaSyncError: message,
      message,
      bostaSyncedAt: new Date(),
    });
  }

  if (trackingNumber) {
    const updated = await updateCsBostaDelivery(trackingNumber, built.party);
    const message = updated.ok
      ? "تم تحديث بوليصة بوسطة."
      : updated.message;
    await writeConfirmation({
      confirmationId: input.confirmationId,
      snapshot: input.snapshot,
      trackingNumber,
      bostaStatus,
      bostaShippingFee,
      bostaSyncError: updated.ok ? null : message,
    });
    if (updated.ok) {
      await rememberShipment({
        wooOrderId: input.wooOrderId,
        wooOrderNumber: input.wooOrderNumber,
        trackingNumber,
        status: bostaStatus,
        party: built.party,
        raw: updated.raw,
      });
    }
    return present({
      trackingNumber,
      bostaStatus,
      bostaShippingFee,
      bostaSyncError: updated.ok ? null : message,
      message,
      bostaSyncedAt: new Date(),
    });
  }

  const created = await createCsBostaDelivery(built.party);
  if (!created.ok || !created.trackingNumber) {
    const message = created.ok ? "بوسطة لم ترجع رقم تتبع." : created.message;
    await writeConfirmation({
      confirmationId: input.confirmationId,
      snapshot: input.snapshot,
      trackingNumber: null,
      bostaStatus: input.bostaStatus,
      bostaShippingFee: input.bostaShippingFee,
      bostaSyncError: message,
    });
    return present({
      trackingNumber: null,
      bostaStatus: input.bostaStatus,
      bostaShippingFee: input.bostaShippingFee,
      bostaSyncError: message,
      message,
      bostaSyncedAt: new Date(),
    });
  }

  let raw = created.raw;
  let details = readBostaLiveDetails(raw);
  if (created.trackingNumber && details.shippingFee == null) {
    const live = await fetchCsBostaDelivery(created.trackingNumber);
    if (live.ok) {
      raw = live.data;
      details = readBostaLiveDetails(live.data);
    }
  }
  const fee = details.shippingFee ?? readBostaShippingFee(raw) ?? input.bostaShippingFee;
  const status = normalizeBostaStatus(details.status || readBostaStatus(raw) || "created");
  await writeConfirmation({
    confirmationId: input.confirmationId,
    snapshot: input.snapshot,
    trackingNumber: created.trackingNumber,
    bostaStatus: status,
    bostaShippingFee: fee,
    bostaSyncError: null,
  });
  await rememberShipment({
    wooOrderId: input.wooOrderId,
    wooOrderNumber: input.wooOrderNumber,
    trackingNumber: created.trackingNumber,
    deliveryId: created.deliveryId,
    status,
    party: built.party,
    raw,
  });
  return present({
    trackingNumber: created.trackingNumber,
    bostaStatus: status,
    bostaShippingFee: fee,
    message: "تم إنشاء بوليصة بوسطة ونزل رقم التراك.",
    bostaSyncedAt: new Date(),
    cod: details.cod,
    lastEvent: details.lastEvent,
  });
}

export async function refreshCsBostaWaybill(confirmationId: number): Promise<BostaWaybillState | null> {
  const prisma = getPrismaClient();
  if (!prisma) return null;
  const row = await prisma.csOrderConfirmation.findUnique({
    where: { id: confirmationId },
    include: { answers: true },
  });
  if (!row) return null;
  const typed = row as {
    shippingCompany?: string | null;
    trackingNumber?: string | null;
    bostaStatus?: string | null;
    bostaShippingFee?: unknown;
    bostaSyncedAt?: Date | null;
    bostaSyncError?: string | null;
  };
  const tracking = String(typed.trackingNumber || "").trim();
  const currentFee = typed.bostaShippingFee == null ? null : Number(typed.bostaShippingFee);
  if (typed.shippingCompany !== "bosta") {
    return present({
      trackingNumber: tracking || null,
      bostaStatus: typed.bostaStatus,
      bostaShippingFee: Number.isFinite(currentFee) ? currentFee : null,
      bostaSyncedAt: typed.bostaSyncedAt,
      bostaSyncError: typed.bostaSyncError,
    });
  }
  if (!tracking) {
    const linked = await linkExistingBostaDelivery({
      confirmationId,
      wooOrderId: row.wooOrderId,
      wooOrderNumber: row.wooOrderNumber,
      snapshot: (row.customerSnapshot as Snapshot) || null,
      answers: row.answers,
    });
    if (linked) return linked;
    return present({
      trackingNumber: null,
      bostaStatus: typed.bostaStatus,
      bostaShippingFee: Number.isFinite(currentFee) ? currentFee : null,
      bostaSyncedAt: typed.bostaSyncedAt,
      bostaSyncError: typed.bostaSyncError,
    });
  }

  const live = await fetchCsBostaDelivery(tracking);
  if (!live.ok) {
    return present({
      trackingNumber: tracking,
      bostaStatus: typed.bostaStatus,
      bostaShippingFee: Number.isFinite(currentFee) ? currentFee : null,
      bostaSyncedAt: typed.bostaSyncedAt,
      bostaSyncError: typed.bostaSyncError,
      message: live.message,
    });
  }

  const details = readBostaLiveDetails(live.data);
  const status = normalizeBostaStatus(details.status || readBostaStatus(live.data) || typed.bostaStatus || "");
  const fee = details.shippingFee ?? readBostaShippingFee(live.data) ?? (Number.isFinite(currentFee) ? currentFee : null);
  await writeConfirmation({
    confirmationId,
    snapshot: (row.customerSnapshot as Snapshot) || null,
    trackingNumber: tracking,
    bostaStatus: status || typed.bostaStatus || null,
    bostaShippingFee: fee,
    bostaSyncError: null,
  });
  return present({
    trackingNumber: tracking,
    bostaStatus: status || typed.bostaStatus,
    bostaShippingFee: fee,
    bostaSyncedAt: new Date(),
    cod: details.cod,
    lastEvent: details.lastEvent,
  });
}

export async function recordBostaWebhookOnConfirmation(input: {
  wooOrderId?: number | null;
  wooOrderNumber?: string | null;
  trackingNumber?: string | null;
  status?: string | null;
  raw?: unknown;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return;
  const tracking = String(input.trackingNumber || "").trim();
  const wooOrderNumber = String(input.wooOrderNumber || "").trim();
  const prefixed = wooOrderNumber.match(/^woocommerce_(\d+)$/i);
  const orderNumber = prefixed?.[1] || (/^\d+$/.test(wooOrderNumber) ? wooOrderNumber : "");
  const wooOrderId = input.wooOrderId && Number.isFinite(input.wooOrderId) ? input.wooOrderId : null;
  let row = orderNumber
    ? await prisma.csOrderConfirmation.findFirst({ where: { wooOrderNumber: orderNumber } })
    : null;
  if (!row && wooOrderNumber && wooOrderNumber !== orderNumber) {
    row = await prisma.csOrderConfirmation.findFirst({ where: { wooOrderNumber } });
  }
  if (!row && wooOrderId) {
    row = await prisma.csOrderConfirmation.findUnique({ where: { wooOrderId } });
  }
  if (!row && tracking) {
    row = await prisma.csOrderConfirmation.findFirst({ where: { trackingNumber: tracking } });
  }
  if (!row) return;
  const typed = row as { bostaShippingFee?: unknown; trackingNumber?: string | null; bostaStatus?: string | null };
  const fee = readBostaShippingFee(input.raw);
  const currentFee = typed.bostaShippingFee == null ? null : Number(typed.bostaShippingFee);
  const status = normalizeBostaStatus(input.status || readBostaStatus(input.raw) || "");
  await writeConfirmation({
    confirmationId: row.id,
    snapshot: (row.customerSnapshot as Snapshot) || null,
    trackingNumber: tracking || typed.trackingNumber || null,
    bostaStatus: status || typed.bostaStatus || null,
    bostaShippingFee: fee ?? (Number.isFinite(currentFee) ? currentFee : null),
    bostaSyncError: null,
  });
}
