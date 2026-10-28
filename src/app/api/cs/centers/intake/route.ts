import { NextResponse } from "next/server";

import { loadScOrg, resolveScAccess } from "@/lib/cs/sc-centers";
import {
  SC_DEFECTS,
  SC_PURCHASE_SOURCES,
  SC_TICKET_STATUS,
  decideScRefund,
  declineScTicket,
  listScManagerInbox,
  loadScTicket,
  receiveScTicket,
  requestScRefund,
  saveScIntake,
  saveScQuote,
  searchScCustomer,
  createScTicketWaybill,
} from "@/lib/cs/sc-intake";
import { requireCsSession } from "@/lib/session-guards";

async function gate() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) return null;
  const access = await resolveScAccess(session.user.csAgentId);
  if (!access.canOpen) return null;
  return { session, access, agentId: session.user.csAgentId };
}

export async function GET(request: Request) {
  const ctx = await gate();
  if (!ctx) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  const url = new URL(request.url);
  const inbox = url.searchParams.get("inbox");
  const ticketId = Number(url.searchParams.get("ticketId") || 0);
  const phone = url.searchParams.get("phone") || "";

  if (inbox === "1") {
    if (!ctx.access.isManager) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
    const items = await listScManagerInbox();
    return NextResponse.json({ ok: true, access: ctx.access, items });
  }

  if (ticketId) {
    const loaded = await loadScTicket(ctx.access, ticketId);
    if (!loaded.ok) return NextResponse.json({ message: loaded.message }, { status: 404 });
    return NextResponse.json({ ok: true, access: ctx.access, ticket: loaded.ticket });
  }

  const org = ctx.access.isManager ? await loadScOrg() : { centers: [] };
  const meta = {
    ok: true,
    access: ctx.access,
    sources: SC_PURCHASE_SOURCES,
    defects: SC_DEFECTS,
    statuses: SC_TICKET_STATUS,
    centers: org.centers.map((center) => ({ id: center.id, name: center.name })),
  };

  if (!phone) return NextResponse.json(meta);
  const found = await searchScCustomer(ctx.access, phone);
  if (!found.ok) return NextResponse.json({ message: found.message }, { status: 400 });
  return NextResponse.json({ ...meta, ...found });
}

export async function POST(request: Request) {
  const ctx = await gate();
  if (!ctx) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  let body: {
    action?: string;
    ticketId?: number;
    name?: string;
    phone?: string;
    address?: string;
    centerId?: number;
    wooProductId?: number | null;
    productName?: string;
    productCode?: string;
    purchaseSource?: string;
    purchaseSourceNote?: string;
    purchaseDate?: string;
    usageKind?: string;
    visualKind?: string;
    powerCut?: boolean;
    defects?: string[];
    defectOther?: string;
    invoiceUrls?: string[];
    productUrls?: string[];
    complaintUrls?: string[];
    complaintNote?: string;
    customerRequest?: string;
    staffProposal?: string;
    confirmationId?: number | null;
    wooOrderNumber?: string;
    carrier?: "bosta" | "sayed_temima" | "eid" | "momen";
    monaCourierId?: number | null;
    techSpecs?: string;
    inWarranty?: boolean;
    partAvailable?: boolean;
    chargeType?: "paid" | "warranty_free";
    cost?: number | null;
    durationText?: string;
    techNotes?: string;
    kind?: "return" | "exchange";
    reason?: string;
    decision?: "approved" | "rejected";
    note?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: "طلب غير صالح." }, { status: 400 });
  }

  const action = body.action || "intake";
  if (action === "intake") {
    const saved = await saveScIntake(ctx.access, ctx.agentId, {
      name: String(body.name || ""),
      phone: String(body.phone || ""),
      address: String(body.address || ""),
      centerId: body.centerId,
      wooProductId: body.wooProductId,
      productName: String(body.productName || ""),
      productCode: body.productCode,
      purchaseSource: String(body.purchaseSource || ""),
      purchaseSourceNote: body.purchaseSourceNote,
      purchaseDate: body.purchaseDate,
      usageKind: String(body.usageKind || ""),
      visualKind: String(body.visualKind || ""),
      powerCut: Boolean(body.powerCut),
      defects: body.defects,
      defectOther: body.defectOther,
      invoiceUrls: body.invoiceUrls,
      productUrls: body.productUrls,
      complaintUrls: body.complaintUrls,
      complaintNote: body.complaintNote,
      customerRequest: body.customerRequest,
      staffProposal: body.staffProposal,
      confirmationId: body.confirmationId,
      wooOrderNumber: body.wooOrderNumber,
    });
    if (!saved.ok) return NextResponse.json({ message: saved.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: saved.id });
  }

  if (action === "quote") {
    const saved = await saveScQuote(ctx.access, ctx.agentId, {
      ticketId: Number(body.ticketId),
      techSpecs: String(body.techSpecs || ""),
      inWarranty: Boolean(body.inWarranty),
      partAvailable: Boolean(body.partAvailable),
      chargeType: body.chargeType === "warranty_free" ? "warranty_free" : "paid",
      cost: body.cost,
      durationText: String(body.durationText || ""),
      techNotes: body.techNotes,
    });
    if (!saved.ok) return NextResponse.json({ message: saved.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "receive") {
    const saved = await receiveScTicket(ctx.access, ctx.agentId, Number(body.ticketId), body.techNotes);
    if (!saved.ok) return NextResponse.json({ message: saved.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "decline") {
    const saved = await declineScTicket(ctx.access, ctx.agentId, Number(body.ticketId), body.note);
    if (!saved.ok) return NextResponse.json({ message: saved.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "refund") {
    const saved = await requestScRefund(ctx.access, ctx.agentId, {
      ticketId: Number(body.ticketId),
      kind: body.kind === "exchange" ? "exchange" : "return",
      reason: String(body.reason || ""),
    });
    if (!saved.ok) return NextResponse.json({ message: saved.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "decide") {
    const saved = await decideScRefund(ctx.access, ctx.agentId, {
      ticketId: Number(body.ticketId),
      decision: body.decision === "rejected" ? "rejected" : "approved",
      note: body.note,
    });
    if (!saved.ok) return NextResponse.json({ message: saved.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "waybill") {
    const carrier =
      body.carrier === "bosta" || body.carrier === "sayed_temima" || body.carrier === "eid" || body.carrier === "momen"
        ? body.carrier
        : null;
    if (!carrier) return NextResponse.json({ message: "اختار شركة الشحن." }, { status: 400 });
    const saved = await createScTicketWaybill(ctx.access, ctx.agentId, {
      ticketId: Number(body.ticketId),
      carrier,
      monaCourierId: body.monaCourierId,
    });
    if (!saved.ok) return NextResponse.json({ message: saved.message }, { status: 400 });
    return NextResponse.json(saved);
  }

  return NextResponse.json({ message: "طلب ناقص." }, { status: 400 });
}
