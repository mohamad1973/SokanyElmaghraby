import "server-only";

import type { CsChecklistAnswerInput } from "@/lib/cs/checklist";
import { getPrismaClient } from "@/lib/db";
import { isDisplayablePlaceName, resolveSnapshotLocation } from "@/lib/cs/resolve-location";
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
import { fulfillmentWaybillDraft, orderItemsDescription } from "@/lib/cs/fulfillment-waybill";
import { hydrateWaybillSnapshot } from "@/lib/cs/hydrate-waybill-snapshot";
import { usesSokanyWaybillPrint } from "@/lib/cs/sokany-waybill-types";
import { effectivePaymentState } from "@/lib/cs/order-window";
import {
  bostaStatusLocksEdits,
  getBostaStatusLabelAr,
  normalizeBostaStatus,
  type BostaTrackEvent,
} from "@/lib/shipping/bosta-zones";

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
  governorate: string | null;
  events: BostaTrackEvent[];
};

function textOf(answers: CsChecklistAnswerInput[], key: string) {
  const item = answers.find((answer) => answer.itemKey === key);
  return String(item?.value || "").trim();
}

/** Prefer Woo/site snapshot place names; agent answers only fill gaps. */
function preferSiteLocation(snapValue: unknown, answerValue: string) {
  const site = String(snapValue || "").trim();
  if (isDisplayablePlaceName(site)) return site;
  const answer = String(answerValue || "").trim();
  if (isDisplayablePlaceName(answer)) return answer;
  return site || answer;
}

/** Split Bosta placeLabel «مدينة - منطقة» when present. */
function splitBostaPlaceLabel(placeLabel: string): { governorate: string; area: string } {
  const raw = String(placeLabel || "").trim();
  if (!raw) return { governorate: "", area: "" };
  const parts = raw.split(/\s*[-–—·]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { governorate: parts[0], area: parts.slice(1).join(" - ") };
  }
  return { governorate: raw, area: "" };
}

/** Extra phone from + on primary card; falls back to legacy alt_phone note. */
export function secondPhoneFromAnswers(answers: CsChecklistAnswerInput[]) {
  const extra = answers.find((answer) => answer.itemKey === "extra_phone");
  const fromExtra = String(extra?.value || "").trim();
  if (fromExtra) return fromExtra;
  const legacy = answers.find((answer) => answer.itemKey === "alt_phone");
  if (!legacy) return "";
  if (legacy.yesNo === "no" || legacy.value === "no") return "";
  return String(legacy.note || "").trim();
}

function csBostaBusinessReference(wooOrderNumber: string, wooOrderId: number) {
  const number = String(wooOrderNumber || "").replace(/^#/, "").trim();
  return number && number !== "0" ? `Woocommerce_${number}` : `Woocommerce_${wooOrderId}`;
}

function mergeChecklistAnswers(saved: CsChecklistAnswerInput[], overlay?: CsChecklistAnswerInput[]) {
  if (!overlay?.length) return saved;
  const map = new Map(saved.map((row) => [row.itemKey, row]));
  for (const row of overlay) {
    const key = String(row.itemKey || "").trim();
    if (!key) continue;
    const prev = map.get(key);
    map.set(key, {
      itemKey: key,
      confirmed: Boolean(row.confirmed || prev?.confirmed),
      value: row.value !== undefined ? row.value : prev?.value,
      note: row.note !== undefined ? row.note : prev?.note,
      yesNo: row.yesNo !== undefined ? row.yesNo : prev?.yesNo,
    });
  }
  return [...map.values()];
}

function partyFromAnswers(input: {
  answers: CsChecklistAnswerInput[];
  snapshot: Snapshot;
  wooOrderId: number;
  wooOrderNumber: string;
  orderTotalDelta?: number | null;
  depositAmount?: number | null;
  depositPaid?: boolean | null;
  depositApprovalStatus?: string | null;
}): { ok: true; party: CsBostaParty } | { ok: false; message: string } {
  const snap = input.snapshot || {};
  const loc = resolveSnapshotLocation({
    governorate: String(snap.governorate || ""),
    area: String(snap.area || ""),
    address: String(snap.address || ""),
    state: String(snap.state || ""),
    city: String(snap.city || ""),
  });
  const name = textOf(input.answers, "customer_name") || String(snap.customerName || "").trim();
  const phone = textOf(input.answers, "primary_phone") || String(snap.phone || "").trim();
  const address = textOf(input.answers, "address_complete") || loc.address || String(snap.address || "").trim();
  const governorate = preferSiteLocation(loc.governorate || snap.governorate, textOf(input.answers, "governorate_confirm"));
  const area = preferSiteLocation(loc.area || snap.area, textOf(input.answers, "area_confirm"));
  const landmarks = textOf(input.answers, "address_landmarks");
  const reference = csBostaBusinessReference(input.wooOrderNumber, input.wooOrderId);
  if (!name || !phone || !address || !governorate) {
    return { ok: false, message: "بيانات البوليصة ناقصة: الاسم أو التليفون أو العنوان أو المحافظة." };
  }
  const fulfillment = fulfillmentWaybillDraft(snap);
  const items = orderItemsDescription(snap);
  if (fulfillment) {
    const noteParts = [fulfillment.description, landmarks || null].filter(Boolean);
    return {
      ok: true,
      party: {
        name,
        phone,
        secondPhone: secondPhoneFromAnswers(input.answers) || undefined,
        governorate,
        area,
        address,
        landmarks,
        cod: fulfillment.cod,
        reference,
        notes: noteParts.join(" — "),
        deliveryKind: fulfillment.deliveryKind,
        description: fulfillment.description,
        itemsCount: fulfillment.itemsCount,
      },
    };
  }

  const paymentState = effectivePaymentState({
    paymentMethod: String(snap.paymentMethod || ""),
    paymentMethodId: snap.paymentMethodId == null ? null : String(snap.paymentMethodId),
    wooStatus: String(snap.wooStatus || snap.status || ""),
    datePaid: snap.datePaid == null ? null : String(snap.datePaid),
    paymentState: snap.paymentState === "paid" || snap.paymentState === "awaiting_payment" || snap.paymentState === "cod" ? snap.paymentState : null,
  });
  const total = Number(String(snap.wooTotal || snap.total || "").replace(/,/g, ""));
  const delta = Number(input.orderTotalDelta);
  const adjusted = Math.max(0, (Number.isFinite(total) ? total : 0) + (Number.isFinite(delta) ? delta : 0));
  const depositApproved =
    Boolean(input.depositPaid || String(input.depositApprovalStatus || "").toLowerCase() === "approved") &&
    Number(input.depositAmount) > 0;
  const deposit = depositApproved ? Math.min(adjusted, Number(input.depositAmount) || 0) : 0;
  const cod = paymentState === "paid" ? 0 : Math.max(0, adjusted - deposit);
  return {
    ok: true,
    party: {
      name,
      phone,
      secondPhone: secondPhoneFromAnswers(input.answers) || undefined,
      governorate,
      area,
      address,
      landmarks,
      cod,
      reference,
      notes: [`طلب #${input.wooOrderNumber}`, landmarks].filter(Boolean).join(" — "),
      description: items.text || `طلب #${input.wooOrderNumber}`,
      itemsCount: items.count,
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
  governorate?: string | null;
  events?: BostaTrackEvent[];
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
    governorate: input.governorate || null,
    events: input.events || [],
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
  governorate?: string | null;
  area?: string | null;
  shippingCompany?: string | null;
}) {
  const prisma = getPrismaClient();
  if (!prisma) return;
  const existing = (input.snapshot || {}) as Record<string, unknown>;
  const siteGovGood = isDisplayablePlaceName(String(existing.governorate || ""));
  const siteAreaGood = isDisplayablePlaceName(String(existing.area || ""));
  const fromLabel = splitBostaPlaceLabel(String(input.governorate || ""));
  const incomingGov = fromLabel.governorate;
  const incomingArea = String(input.area || "").trim() || fromLabel.area;

  const snap: Record<string, unknown> = {
    ...existing,
    trackingNumber: input.trackingNumber,
  };
  let wroteGov = false;
  let wroteArea = false;
  // Never overwrite a good site governorate with Bosta placeLabel.
  if (!siteGovGood && isDisplayablePlaceName(incomingGov)) {
    snap.governorate = incomingGov;
    wroteGov = true;
  }
  // Fill area from Bosta only when the site snapshot has no usable area.
  if (!siteAreaGood && isDisplayablePlaceName(incomingArea)) {
    snap.area = incomingArea;
    wroteArea = true;
  }

  await prisma.csOrderConfirmation.update({
    where: { id: input.confirmationId },
    data: {
      trackingNumber: input.trackingNumber,
      bostaStatus: input.bostaStatus,
      bostaShippingFee: input.bostaShippingFee,
      bostaSyncedAt: new Date(),
      bostaSyncError: input.bostaSyncError ? input.bostaSyncError.slice(0, 255) : null,
      customerSnapshot: snap,
      ...(input.shippingCompany ? { shippingCompany: input.shippingCompany } : {}),
    } as never,
  });
  if (wroteGov) {
    const governorate = String(snap.governorate || "").trim();
    await prisma.csChecklistAnswer.upsert({
      where: {
        confirmationId_itemKey: {
          confirmationId: input.confirmationId,
          itemKey: "governorate_confirm",
        },
      },
      create: {
        confirmationId: input.confirmationId,
        itemKey: "governorate_confirm",
        confirmed: true,
        value: governorate,
      },
      update: {
        confirmed: true,
        value: governorate,
      },
    });
  }
  if (wroteArea) {
    const area = String(snap.area || "").trim();
    await prisma.csChecklistAnswer.upsert({
      where: {
        confirmationId_itemKey: {
          confirmationId: input.confirmationId,
          itemKey: "area_confirm",
        },
      },
      create: {
        confirmationId: input.confirmationId,
        itemKey: "area_confirm",
        confirmed: true,
        value: area,
      },
      update: {
        confirmed: true,
        value: area,
      },
    });
  }
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
    placeLabel?: string | null;
    events?: BostaTrackEvent[];
  };
}): Promise<BostaWaybillState> {
  const status = normalizeBostaStatus(input.found.status || "created");
  const placeLabel = String(input.found.placeLabel || "").trim() || null;
  await writeConfirmation({
    confirmationId: input.confirmationId,
    snapshot: input.snapshot,
    trackingNumber: input.found.trackingNumber,
    bostaStatus: status,
    bostaShippingFee: input.found.shippingFee,
    bostaSyncError: null,
    governorate: placeLabel,
    shippingCompany: "bosta",
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
  const governorate =
    preferSiteLocation(input.snapshot?.governorate, splitBostaPlaceLabel(placeLabel || "").governorate) || null;
  return present({
    trackingNumber: input.found.trackingNumber,
    bostaStatus: status,
    bostaShippingFee: input.found.shippingFee,
    message: "تم ربط بوليصة بوسطة الموجودة.",
    bostaSyncedAt: new Date(),
    cod: input.found.cod,
    lastEvent: input.found.lastEvent,
    governorate,
    events: input.found.events,
  });
}

export async function attachBostaWaybillByOrderReference(input: {
  confirmationId: number;
  wooOrderId: number;
  wooOrderNumber: string;
  snapshot: Snapshot;
  knownTracking?: string | null;
  onlyIfFound?: boolean;
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
        placeLabel: details?.placeLabel || null,
        events: details?.events,
      },
    });
    return true;
  }
  const lookup = await findBostaDeliveryByOrderReference({
    wooOrderId: input.wooOrderId,
    wooOrderNumber: input.wooOrderNumber,
  });
  if (!lookup.details?.trackingNumber) {
    if (input.onlyIfFound) return false;
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
      placeLabel: lookup.details.placeLabel,
      events: lookup.details.events,
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
        placeLabel: byOrder.details.placeLabel,
        events: byOrder.details.events,
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
  orderTotalDelta?: number | null;
  depositAmount?: number | null;
  depositPaid?: boolean | null;
  depositApprovalStatus?: string | null;
  /** When true, create/update AWB without forcing shippingCompany=bosta (desk-owned fulfillment). */
  preserveShippingCompany?: boolean;
}): Promise<BostaWaybillState> {
  if (input.shippingCompany !== "bosta" && !input.preserveShippingCompany) {
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

  const prisma = getPrismaClient();
  let orderTotalDelta = input.orderTotalDelta ?? null;
  let depositAmount = input.depositAmount ?? null;
  let depositPaid = input.depositPaid ?? null;
  let depositApprovalStatus = input.depositApprovalStatus ?? null;
  let discountApprovalStatus: string | null = null;
  if (
    prisma &&
    (orderTotalDelta == null || depositAmount == null || depositApprovalStatus == null || !discountApprovalStatus)
  ) {
    const row = await prisma.csOrderConfirmation.findUnique({
      where: { id: input.confirmationId },
      select: {
        orderTotalDelta: true,
        depositAmount: true,
        depositPaid: true,
        depositApprovalStatus: true,
        discountApprovalStatus: true,
      } as never,
    });
    const typed = row as {
      orderTotalDelta?: unknown;
      depositAmount?: unknown;
      depositPaid?: boolean | null;
      depositApprovalStatus?: string | null;
      discountApprovalStatus?: string | null;
    } | null;
    if (typed) {
      discountApprovalStatus = typed.discountApprovalStatus || null;
      if (orderTotalDelta == null && typed.orderTotalDelta != null) {
        const n = Number(typed.orderTotalDelta);
        orderTotalDelta = Number.isFinite(n) ? n : null;
      }
      if (depositAmount == null && typed.depositAmount != null) {
        const n = Number(typed.depositAmount);
        depositAmount = Number.isFinite(n) ? n : null;
      }
      if (depositPaid == null) depositPaid = Boolean(typed.depositPaid);
      if (depositApprovalStatus == null) depositApprovalStatus = typed.depositApprovalStatus || null;
    }
  }
  // Only approved discounts change COD on the waybill.
  if (String(discountApprovalStatus || "").toLowerCase() !== "approved") {
    orderTotalDelta = null;
  } else if (orderTotalDelta != null && !(Number(orderTotalDelta) < 0)) {
    orderTotalDelta = null;
  }

  const snapshot = await hydrateWaybillSnapshot(
    (input.snapshot || {}) as Record<string, unknown>,
    input.wooOrderId,
  );
  const built = partyFromAnswers({
    ...input,
    snapshot,
    orderTotalDelta,
    depositAmount,
    depositPaid,
    depositApprovalStatus,
  });
  if (!built.ok) {
    await writeConfirmation({
      confirmationId: input.confirmationId,
      snapshot,
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
      snapshot,
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
      snapshot,
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
      snapshot,
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
    snapshot,
    trackingNumber: created.trackingNumber,
    bostaStatus: status,
    bostaShippingFee: fee,
    bostaSyncError: null,
    ...(input.preserveShippingCompany ? {} : { shippingCompany: "bosta" }),
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
    events: details.events,
  });
}

function moneySnapshotWithWaybillTotal(snapshot: Snapshot, orderTotalDelta: number | null): Snapshot {
  const next: Record<string, unknown> = { ...(snapshot || {}) };
  const rawBase = Number(String(next.wooTotal || next.total || "").replace(/,/g, ""));
  if (Number.isFinite(rawBase) && !next.wooTotal) next.wooTotal = String(rawBase);
  const base = Number(String(next.wooTotal || next.total || "").replace(/,/g, ""));
  const delta = Number(orderTotalDelta);
  if (Number.isFinite(base)) {
    const adjusted = Math.max(0, base + (Number.isFinite(delta) ? delta : 0));
    next.waybillTotal = String(adjusted);
  }
  return next;
}

/**
 * After discount/deposit approval: refresh local waybillTotal and push COD to Bosta
 * when a delivery already exists (does not create a new waybill).
 */
export async function syncConfirmationMoneyToBosta(confirmationId: number): Promise<{
  ok: true;
  synced: boolean;
  message: string | null;
  bosta: BostaWaybillState | null;
}> {
  const prisma = getPrismaClient();
  if (!prisma || !Number.isInteger(confirmationId) || confirmationId <= 0) {
    return { ok: true, synced: false, message: null, bosta: null };
  }

  const row = await prisma.csOrderConfirmation.findUnique({
    where: { id: confirmationId },
    include: { answers: true },
  });
  if (!row) return { ok: true, synced: false, message: null, bosta: null };

  const typed = row as {
    shippingCompany?: string | null;
    trackingNumber?: string | null;
    bostaStatus?: string | null;
    bostaShippingFee?: unknown;
    orderTotalDelta?: unknown;
    depositAmount?: unknown;
    depositPaid?: boolean | null;
    depositApprovalStatus?: string | null;
    discountApprovalStatus?: string | null;
  };

  const discountApproved = String(typed.discountApprovalStatus || "").toLowerCase() === "approved";
  let orderTotalDelta: number | null = null;
  if (discountApproved && typed.orderTotalDelta != null) {
    const n = Number(typed.orderTotalDelta);
    if (Number.isFinite(n) && n < 0) orderTotalDelta = n;
  }

  const snap = moneySnapshotWithWaybillTotal((row.customerSnapshot as Snapshot) || null, orderTotalDelta);
  await prisma.csOrderConfirmation.update({
    where: { id: confirmationId },
    data: { customerSnapshot: snap } as never,
  });

  if (typed.shippingCompany !== "bosta") {
    return { ok: true, synced: false, message: null, bosta: null };
  }

  const answers: CsChecklistAnswerInput[] = row.answers.map((answer) => ({
    itemKey: answer.itemKey,
    confirmed: Boolean(answer.confirmed),
    value: answer.value,
    note: answer.note,
  }));

  let trackingNumber = String(typed.trackingNumber || "").trim() || null;
  let bostaStatus = typed.bostaStatus || null;
  let bostaShippingFee =
    typed.bostaShippingFee == null || !Number.isFinite(Number(typed.bostaShippingFee))
      ? null
      : Number(typed.bostaShippingFee);

  if (!trackingNumber) {
    const linked = await linkExistingBostaDelivery({
      confirmationId,
      wooOrderId: row.wooOrderId,
      wooOrderNumber: row.wooOrderNumber,
      snapshot: snap,
      answers,
    });
    if (linked?.trackingNumber) {
      trackingNumber = linked.trackingNumber;
      bostaStatus = linked.bostaStatus;
      bostaShippingFee = linked.bostaShippingFee;
    }
  }

  if (!trackingNumber) {
    return { ok: true, synced: false, message: null, bosta: null };
  }

  const depositAmount =
    typed.depositAmount == null || !Number.isFinite(Number(typed.depositAmount))
      ? null
      : Number(typed.depositAmount);

  const state = await syncCsBostaWaybill({
    confirmationId,
    wooOrderId: row.wooOrderId,
    wooOrderNumber: row.wooOrderNumber,
    shippingCompany: "bosta",
    trackingNumber,
    bostaStatus,
    bostaShippingFee,
    answers,
    snapshot: snap,
    orderTotalDelta,
    depositAmount,
    depositPaid: Boolean(typed.depositPaid),
    depositApprovalStatus: typed.depositApprovalStatus || null,
  });

  const synced = !state.bostaSyncError;
  if (synced) {
    await prisma.csOrderConfirmation.update({
      where: { id: confirmationId },
      data: { waybillPrinted: false } as never,
    });
  }

  return {
    ok: true,
    synced,
    message: state.message || state.bostaSyncError,
    bosta: state,
  };
}

/**
 * Link an existing Bosta delivery by order reference, or create one and attach tracking.
 * Used when the agent wants to print an AWB but none exists yet.
 */
export async function ensureCsBostaWaybill(
  confirmationId: number,
  opts?: { preserveShippingCompany?: boolean; answers?: CsChecklistAnswerInput[] },
): Promise<{ ok: true; created: boolean; state: BostaWaybillState } | { ok: false; message: string }> {
  const prisma = getPrismaClient();
  if (!prisma || !Number.isInteger(confirmationId) || confirmationId <= 0) {
    return { ok: false, message: "الطلب غير موجود." };
  }
  const row = await prisma.csOrderConfirmation.findUnique({
    where: { id: confirmationId },
    include: { answers: true },
  });
  if (!row) return { ok: false, message: "الطلب غير موجود." };

  const typed = row as {
    trackingNumber?: string | null;
    bostaStatus?: string | null;
    bostaShippingFee?: unknown;
    orderTotalDelta?: unknown;
    depositAmount?: unknown;
    depositPaid?: boolean | null;
    depositApprovalStatus?: string | null;
    shippingCompany?: string | null;
  };
  const answers = mergeChecklistAnswers(
    row.answers.map((answer) => ({
      itemKey: answer.itemKey,
      confirmed: Boolean(answer.confirmed),
      value: answer.value,
      note: answer.note,
    })),
    opts?.answers,
  );
  const snapshot = (row.customerSnapshot as Snapshot) || null;
  const fee =
    typed.bostaShippingFee == null || !Number.isFinite(Number(typed.bostaShippingFee))
      ? null
      : Number(typed.bostaShippingFee);
  if (usesSokanyWaybillPrint(typed.shippingCompany)) {
    return { ok: false, message: "هذه الشركة تطبع بوليصة سوكانى، مش بوسطة." };
  }
  const preserveShippingCompany = Boolean(opts?.preserveShippingCompany);

  const existingTracking = String(typed.trackingNumber || "").trim();
  const beforeTracking = existingTracking;
  const state = await syncCsBostaWaybill({
    confirmationId,
    wooOrderId: row.wooOrderId,
    wooOrderNumber: row.wooOrderNumber,
    shippingCompany: preserveShippingCompany ? typed.shippingCompany || "bosta" : "bosta",
    trackingNumber: existingTracking || null,
    bostaStatus: typed.bostaStatus || null,
    bostaShippingFee: fee,
    answers,
    snapshot,
    orderTotalDelta: typed.orderTotalDelta == null ? null : Number(typed.orderTotalDelta),
    depositAmount: typed.depositAmount == null ? null : Number(typed.depositAmount),
    depositPaid: Boolean(typed.depositPaid),
    depositApprovalStatus: typed.depositApprovalStatus || null,
    preserveShippingCompany,
  });

  if (!state.trackingNumber) {
    return {
      ok: false,
      message: state.bostaSyncError || state.message || "تعذر إنشاء بوليصة بوسطة.",
    };
  }
  const created = !beforeTracking || beforeTracking !== state.trackingNumber;
  return { ok: true, created, state };
}

/** Update city + وصف الشحنة on an existing Bosta AWB from the CS card, without creating a new shipment. */
export async function alignCsBostaWaybillBeforePrint(confirmationId: number) {
  const prisma = getPrismaClient();
  if (!prisma || !Number.isInteger(confirmationId) || confirmationId <= 0) return;
  const row = await prisma.csOrderConfirmation.findUnique({
    where: { id: confirmationId },
    include: { answers: true },
  });
  if (!row) return;
  const typed = row as {
    trackingNumber?: string | null;
    bostaStatus?: string | null;
    bostaShippingFee?: unknown;
    orderTotalDelta?: unknown;
    depositAmount?: unknown;
    depositPaid?: boolean | null;
    depositApprovalStatus?: string | null;
    shippingCompany?: string | null;
  };
  const tracking = String(typed.trackingNumber || "").trim();
  if (!tracking) return;
  if (String(typed.shippingCompany || "").trim() !== "bosta") return;
  if (/^SK-/i.test(tracking)) return;
  const fee =
    typed.bostaShippingFee == null || !Number.isFinite(Number(typed.bostaShippingFee))
      ? null
      : Number(typed.bostaShippingFee);
  await syncCsBostaWaybill({
    confirmationId,
    wooOrderId: row.wooOrderId,
    wooOrderNumber: row.wooOrderNumber,
    shippingCompany: typed.shippingCompany || "bosta",
    trackingNumber: tracking,
    bostaStatus: typed.bostaStatus || null,
    bostaShippingFee: fee,
    answers: row.answers.map((answer) => ({
      itemKey: answer.itemKey,
      confirmed: Boolean(answer.confirmed),
      value: answer.value,
      note: answer.note,
    })),
    snapshot: (row.customerSnapshot as Snapshot) || null,
    orderTotalDelta: typed.orderTotalDelta == null ? null : Number(typed.orderTotalDelta),
    depositAmount: typed.depositAmount == null ? null : Number(typed.depositAmount),
    depositPaid: Boolean(typed.depositPaid),
    depositApprovalStatus: typed.depositApprovalStatus || null,
    preserveShippingCompany: typed.shippingCompany !== "bosta",
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
  const placeLabel = String(details.placeLabel || "").trim() || null;
  const snap = (row.customerSnapshot as Snapshot) || null;
  await writeConfirmation({
    confirmationId,
    snapshot: snap,
    trackingNumber: tracking,
    bostaStatus: status || typed.bostaStatus || null,
    bostaShippingFee: fee,
    bostaSyncError: null,
    governorate: placeLabel,
  });
  const governorate =
    preferSiteLocation(snap?.governorate, splitBostaPlaceLabel(placeLabel || "").governorate) || null;
  return present({
    trackingNumber: tracking,
    bostaStatus: status || typed.bostaStatus,
    bostaShippingFee: fee,
    bostaSyncedAt: new Date(),
    cod: details.cod,
    lastEvent: details.lastEvent,
    governorate,
    events: details.events,
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
  const governorate = String(readBostaLiveDetails(input.raw).placeLabel || "").trim() || null;
  await writeConfirmation({
    confirmationId: row.id,
    snapshot: (row.customerSnapshot as Snapshot) || null,
    trackingNumber: tracking || typed.trackingNumber || null,
    bostaStatus: status || typed.bostaStatus || null,
    bostaShippingFee: fee ?? (Number.isFinite(currentFee) ? currentFee : null),
    bostaSyncError: null,
    governorate,
  });
}
