import "server-only";

import type { CsChecklistAnswerInput } from "@/lib/cs/checklist";
import { getPrismaClient } from "@/lib/db";
import {
  createCsBostaDelivery,
  fetchCsBostaDelivery,
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

  const built = partyFromAnswers(input);
  if (!built.ok) {
    await writeConfirmation({
      confirmationId: input.confirmationId,
      snapshot: input.snapshot,
      trackingNumber: input.trackingNumber,
      bostaStatus: input.bostaStatus,
      bostaShippingFee: input.bostaShippingFee,
      bostaSyncError: built.message,
    });
    return present({
      trackingNumber: input.trackingNumber,
      bostaStatus: input.bostaStatus,
      bostaShippingFee: input.bostaShippingFee,
      bostaSyncError: built.message,
      message: built.message,
      bostaSyncedAt: new Date(),
    });
  }

  if (input.trackingNumber && bostaStatusLocksEdits(input.bostaStatus)) {
    const message = "تم حفظ التعديل هنا. بوسطة قفلت تعديل البوليصة بعد استلام المندوب.";
    await writeConfirmation({
      confirmationId: input.confirmationId,
      snapshot: input.snapshot,
      trackingNumber: input.trackingNumber,
      bostaStatus: input.bostaStatus,
      bostaShippingFee: input.bostaShippingFee,
      bostaSyncError: message,
    });
    return present({
      trackingNumber: input.trackingNumber,
      bostaStatus: input.bostaStatus,
      bostaShippingFee: input.bostaShippingFee,
      bostaSyncError: message,
      message,
      bostaSyncedAt: new Date(),
    });
  }

  if (input.trackingNumber) {
    const updated = await updateCsBostaDelivery(input.trackingNumber, built.party);
    const message = updated.ok
      ? "تم تحديث بوليصة بوسطة."
      : updated.message;
    await writeConfirmation({
      confirmationId: input.confirmationId,
      snapshot: input.snapshot,
      trackingNumber: input.trackingNumber,
      bostaStatus: input.bostaStatus,
      bostaShippingFee: input.bostaShippingFee,
      bostaSyncError: updated.ok ? null : message,
    });
    if (updated.ok) {
      await rememberShipment({
        wooOrderId: input.wooOrderId,
        wooOrderNumber: input.wooOrderNumber,
        trackingNumber: input.trackingNumber,
        status: input.bostaStatus,
        party: built.party,
        raw: updated.raw,
      });
    }
    return present({
      trackingNumber: input.trackingNumber,
      bostaStatus: input.bostaStatus,
      bostaShippingFee: input.bostaShippingFee,
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

  const fee = readBostaShippingFee(created.raw) ?? input.bostaShippingFee;
  const status = normalizeBostaStatus(readBostaStatus(created.raw) || "created");
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
    raw: created.raw,
  });
  return present({
    trackingNumber: created.trackingNumber,
    bostaStatus: status,
    bostaShippingFee: fee,
    message: "تم إنشاء بوليصة بوسطة ونزل رقم التراك.",
    bostaSyncedAt: new Date(),
  });
}

export async function refreshCsBostaWaybill(confirmationId: number): Promise<BostaWaybillState | null> {
  const prisma = getPrismaClient();
  if (!prisma) return null;
  const row = await prisma.csOrderConfirmation.findUnique({ where: { id: confirmationId } });
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
  if (typed.shippingCompany !== "bosta" || !tracking) {
    return present({
      trackingNumber: tracking || null,
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

  const status = normalizeBostaStatus(readBostaStatus(live.data) || typed.bostaStatus || "");
  const fee = readBostaShippingFee(live.data) ?? (Number.isFinite(currentFee) ? currentFee : null);
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
  });
}

export async function recordBostaWebhookOnConfirmation(input: {
  wooOrderId?: number | null;
  trackingNumber?: string | null;
  status?: string | null;
  raw?: unknown;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return;
  const tracking = String(input.trackingNumber || "").trim();
  const wooOrderId = input.wooOrderId && Number.isFinite(input.wooOrderId) ? input.wooOrderId : null;
  const row = wooOrderId
    ? await prisma.csOrderConfirmation.findUnique({ where: { wooOrderId } })
    : tracking
      ? await prisma.csOrderConfirmation.findFirst({ where: { trackingNumber: tracking } })
      : null;
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
