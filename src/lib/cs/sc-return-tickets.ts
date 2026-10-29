import "server-only";

import { parseWooOrderNumber } from "@/lib/cs/assignments-client";
import { getPrismaClient } from "@/lib/db";
import { ensureScCenterTables } from "@/lib/cs/sc-centers";
import { SC_TICKET_STATUS, normalizeScPhone } from "@/lib/cs/sc-intake";

export type DeskTicketBadge = {
  id: number;
  statusLabel: string;
  wooOrderNumber: string;
};

type MatchRow = {
  phone: string;
  wooOrderNumber: string;
  confirmationId: number | null;
  parentConfirmationId?: number | null;
  trackingNumber: string;
};

type TicketHit = {
  id: number;
  wooOrderNumber: string;
  confirmationId: number | null;
  fulfillmentConfirmationId: number | null;
  waybillTracking: string;
  status: string;
  customerPhone: string;
};

function last10(value: string) {
  return normalizeScPhone(value).slice(-10);
}

function orderDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function orderKey(value: string) {
  const parsed = parseWooOrderNumber(value);
  return parsed > 0 ? String(parsed) : "";
}

function ticketHasOrder(ticket: TicketHit) {
  return Boolean(
    orderKey(ticket.wooOrderNumber) ||
      orderDigits(ticket.wooOrderNumber) ||
      ticket.confirmationId ||
      ticket.fulfillmentConfirmationId ||
      String(ticket.waybillTracking || "").trim(),
  );
}

function phoneSql() {
  return "RIGHT(REGEXP_REPLACE(IFNULL(cu.phone, ''), '[^0-9]', ''), 10)";
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function confIdsOf(row: MatchRow) {
  return [row.confirmationId, row.parentConfirmationId].filter((value): value is number => Boolean(value && value > 0));
}

function rowMatchesTicket(row: MatchRow, ticket: TicketHit) {
  const rowPhone = last10(row.phone);
  const ticketPhone = last10(ticket.customerPhone);
  const phoneOk = rowPhone.length === 10 && ticketPhone.length === 10 && rowPhone === ticketPhone;
  if (phoneOk) return true;
  if (!ticketHasOrder(ticket)) return false;
  const rowOrder = orderKey(row.wooOrderNumber);
  const ticketOrder = orderKey(ticket.wooOrderNumber);
  const orderOk = Boolean(rowOrder && ticketOrder && rowOrder === ticketOrder);
  const ids = confIdsOf(row);
  const confOk = ids.some(
    (id) => id === ticket.confirmationId || id === ticket.fulfillmentConfirmationId,
  );
  const trackOk = Boolean(
    row.trackingNumber && ticket.waybillTracking && row.trackingNumber.trim() === ticket.waybillTracking.trim(),
  );
  return Boolean(orderOk || confOk || trackOk);
}

function badgeOf(ticket: TicketHit): DeskTicketBadge {
  return {
    id: Number(ticket.id),
    statusLabel: SC_TICKET_STATUS[ticket.status as keyof typeof SC_TICKET_STATUS] || ticket.status,
    wooOrderNumber: ticket.wooOrderNumber || "",
  };
}

export async function attachDeskTicketsToReturns<T extends MatchRow>(
  rows: T[],
): Promise<Array<T & { deskTicket: DeskTicketBadge | null; deskTickets: DeskTicketBadge[] }>> {
  if (!rows.length) {
    return rows.map((row) => ({ ...row, deskTicket: null, deskTickets: [] as DeskTicketBadge[] }));
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    return rows.map((row) => ({ ...row, deskTicket: null, deskTickets: [] as DeskTicketBadge[] }));
  }
  try {
    await ensureScCenterTables();
    const phones = unique(rows.map((row) => last10(row.phone)).filter((value) => value.length === 10));
    const orders = unique(
      rows.flatMap((row) => [orderKey(row.wooOrderNumber), orderDigits(row.wooOrderNumber), String(row.wooOrderNumber || "").trim()]).filter(
        (value) => value.length >= 3,
      ),
    );
    const trackings = unique(rows.map((row) => String(row.trackingNumber || "").trim()));
    const confirmationIds = unique(
      rows.flatMap((row) => confIdsOf(row).map(String)),
    );
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (phones.length) {
      clauses.push(`${phoneSql()} IN (${phones.map(() => "?").join(",")})`);
      params.push(...phones);
    }
    if (orders.length) {
      clauses.push(`t.wooOrderNumber IN (${orders.map(() => "?").join(",")})`);
      params.push(...orders);
    }
    if (trackings.length) {
      clauses.push(`t.waybillTracking IN (${trackings.map(() => "?").join(",")})`);
      params.push(...trackings);
    }
    if (confirmationIds.length) {
      const slots = confirmationIds.map(() => "?").join(",");
      clauses.push(`t.confirmationId IN (${slots}) OR t.fulfillmentConfirmationId IN (${slots})`);
      params.push(...confirmationIds.map(Number), ...confirmationIds.map(Number));
    }
    if (!clauses.length) {
      return rows.map((row) => ({ ...row, deskTicket: null, deskTickets: [] as DeskTicketBadge[] }));
    }
    const tickets = await prisma.$queryRawUnsafe<TicketHit[]>(
      `SELECT t.id, t.wooOrderNumber, t.confirmationId, t.fulfillmentConfirmationId, t.waybillTracking, t.status,
              cu.phone AS customerPhone
       FROM ScTicket t
       JOIN ScCustomer cu ON cu.id = t.customerId
       WHERE ${clauses.join(" OR ")}
       ORDER BY t.id DESC
       LIMIT 400`,
      ...params,
    );
    return rows.map((row) => {
      const hits = tickets.filter((ticket) => rowMatchesTicket(row, ticket)).map(badgeOf);
      const seen = new Set<number>();
      const deskTickets = hits.filter((ticket) => {
        if (seen.has(ticket.id)) return false;
        seen.add(ticket.id);
        return true;
      });
      return { ...row, deskTicket: deskTickets[0] || null, deskTickets };
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[sc-return-tickets] attachDeskTicketsToReturns", detail);
    return rows.map((row) => ({ ...row, deskTicket: null, deskTickets: [] as DeskTicketBadge[] }));
  }
}

export async function linkDeskTicketsToFulfillment(input: {
  parentConfirmationId: number;
  childConfirmationId: number;
  parentWooOrderNumber: string;
  phone?: string | null;
  carrier: string;
  trackingNumber: string;
}) {
  const prisma = getPrismaClient();
  if (!prisma || input.parentConfirmationId <= 0 || input.childConfirmationId <= 0) return;
  try {
    await ensureScCenterTables();
    const parentOrder = orderKey(input.parentWooOrderNumber);
    const parentRaw = String(input.parentWooOrderNumber || "").trim();
    const phone = last10(input.phone || "");
    const clauses = ["t.confirmationId = ?"];
    const params: Array<string | number> = [input.parentConfirmationId];
    if (parentOrder && phone.length === 10) {
      clauses.push(
        `(${phoneSql()} = ? AND (t.wooOrderNumber = ? OR t.wooOrderNumber = ? OR t.wooOrderNumber = ?))`,
      );
      params.push(phone, parentOrder, parentRaw, `#${parentOrder}`);
    }
    const ids = await prisma.$queryRawUnsafe<Array<{ id: number | bigint }>>(
      `SELECT t.id
       FROM ScTicket t
       JOIN ScCustomer cu ON cu.id = t.customerId
       WHERE (${clauses.join(" OR ")})
         AND (t.fulfillmentConfirmationId IS NULL OR t.fulfillmentConfirmationId = 0 OR t.fulfillmentConfirmationId = ?)
       ORDER BY t.id DESC
       LIMIT 20`,
      ...params,
      input.childConfirmationId,
    );
    for (const row of ids) {
      await prisma.$executeRawUnsafe(
        `UPDATE ScTicket SET fulfillmentConfirmationId = ?, waybillCarrier = ?, waybillTracking = ?, updatedAt = NOW(3) WHERE id = ?`,
        input.childConfirmationId,
        input.carrier,
        input.trackingNumber || "",
        Number(row.id),
      );
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[sc-return-tickets] linkDeskTicketsToFulfillment", input.childConfirmationId, detail);
  }
}
