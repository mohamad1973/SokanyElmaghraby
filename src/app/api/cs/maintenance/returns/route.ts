import { NextResponse } from "next/server";

import { maintenanceDbErrorMessage, saveBostaReturnReview } from "@/lib/cs/bosta-return-review";
import {
  maintenanceVarianceReport,
  markReturnOpened,
  markShelf,
  receiveFromMaintenance,
  saveReturnStaffNote,
  saveTechGrade,
} from "@/lib/cs/bosta-return-lifecycle";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import {
  listBostaReceivedReturns,
  listCourierBucketReturns,
  listTemimaReturns,
  maintenanceRange,
} from "@/lib/cs/maintenance-returns";
import { loadScTicketById } from "@/lib/cs/sc-intake";
import { requireCsSession } from "@/lib/session-guards";

type ReturnSource = "bosta" | "temima" | "eid" | "momen";

function canHub(viewer: Awaited<ReturnType<typeof resolveCsViewer>>) {
  return Boolean(viewer.canAccessMaintenanceHub || viewer.isMaintenance);
}

function parseSource(raw: string | null): ReturnSource {
  if (raw === "temima" || raw === "eid" || raw === "momen" || raw === "bosta") return raw;
  return "bosta";
}

async function settledValue<T>(promise: Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[cs/maintenance/returns] ${label}`, detail);
    return fallback;
  }
}

export async function GET(request: Request) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  try {
    const viewer = await resolveCsViewer(session.user.csAgentId);
    if (!canHub(viewer)) {
      return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
    }
    const url = new URL(request.url);
    const ticketId = Number(url.searchParams.get("ticketId") || 0);
    if (ticketId) {
      const loaded = await loadScTicketById(ticketId);
      if (!loaded.ok) return NextResponse.json({ message: loaded.message }, { status: 404 });
      return NextResponse.json({ ok: true, ticket: loaded.ticket });
    }
    const range = maintenanceRange(url.searchParams.get("from") || "", url.searchParams.get("to") || "");
    const source = parseSource(url.searchParams.get("source"));
    const wantVariance = url.searchParams.get("variance") === "1";
    const canDesk = viewer.isMaintenance || viewer.isAdmin;
    type Listed = { rows: Awaited<ReturnType<typeof listBostaReceivedReturns>>["rows"]; error: string | null; detail?: string | null };
    type CourierListed = Listed & { found: boolean };
    const emptyRows: Listed = { rows: [], error: null, detail: null };
    const emptyCourier: CourierListed = { found: false, rows: [], error: null, detail: null };

    let bosta: Listed = emptyRows;
    let temima: Listed = emptyRows;
    let eid: CourierListed = emptyCourier;
    let momen: CourierListed = emptyCourier;

    if (source === "bosta") {
      bosta = await settledValue(
        listBostaReceivedReturns(range.from, range.to),
        { rows: [], error: "تعذر تحميل مرتجعات بوسطة.", detail: null },
        "bosta",
      );
    } else if (source === "temima") {
      temima = canDesk
        ? await settledValue(listTemimaReturns(range.from, range.to), { rows: [], error: null, detail: null }, "temima")
        : emptyRows;
    } else if (source === "eid") {
      eid = canDesk
        ? await settledValue(
            listCourierBucketReturns("eid", range.from, range.to),
            { found: false, rows: [], error: null, detail: null },
            "eid",
          )
        : emptyCourier;
    } else if (source === "momen") {
      momen = canDesk
        ? await settledValue(
            listCourierBucketReturns("momen", range.from, range.to),
            { found: false, rows: [], error: null, detail: null },
            "momen",
          )
        : emptyCourier;
    }

    const variance = wantVariance
      ? await settledValue(maintenanceVarianceReport(range.from, range.to), null, "variance")
      : null;

    const failed = [bosta, temima, eid, momen].find((section) => section.error);

    return NextResponse.json({
      from: range.from,
      to: range.to,
      source,
      bosta: { rows: bosta.rows, error: bosta.error },
      temima: { rows: temima.rows, error: temima.error },
      eid: { found: eid.found, rows: eid.rows, error: eid.error },
      momen: { found: momen.found, rows: momen.rows, error: momen.error },
      variance,
      viewer: {
        isMaintenance: viewer.isMaintenance,
        isMaintenanceTech: viewer.isMaintenanceTech,
        isAccounting: viewer.isAccounting,
        isAdmin: viewer.isAdmin,
      },
      ...(failed
        ? { message: failed.error, detail: failed.detail || undefined, partial: true }
        : {}),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[cs/maintenance/returns] GET", detail);
    return NextResponse.json(
      {
        message: "تعذر تحميل المرتجعات بسبب خطأ في قاعدة البيانات. حاول مرة أخرى.",
        detail: detail.slice(0, 200),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!canHub(viewer)) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as {
    action?: string;
    trackingNumber?: string;
    trackingNumbers?: string[];
    items?: Array<{ trackingNumber?: string; productId?: number | null }>;
    productId?: number | null;
    condition?: string;
    defects?: unknown;
    usage?: string;
    destination?: string;
    note?: string;
    grade?: string;
    techNote?: string;
  } | null;

  const action = String(body?.action || "review");
  const productIdRaw = body?.productId;
  const productId =
    Number.isInteger(productIdRaw) && Number(productIdRaw) !== 0 ? Number(productIdRaw) : null;

  try {
    if (action === "open") {
      if (!(viewer.isMaintenance || viewer.isAdmin)) {
        return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
      }
      const result = await markReturnOpened(String(body?.trackingNumber || ""));
      if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
      return NextResponse.json({ openedAt: result.openedAt });
    }

    if (action === "note") {
      if (!(viewer.isMaintenance || viewer.isAdmin)) {
        return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
      }
      const result = await saveReturnStaffNote(String(body?.trackingNumber || ""), String(body?.note || ""));
      if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
      return NextResponse.json({ note: result.note });
    }

    if (action === "grade") {
      if (!(viewer.isMaintenanceTech || viewer.isAdmin)) {
        return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
      }
      const result = await saveTechGrade({
        trackingNumber: String(body?.trackingNumber || ""),
        grade: String(body?.grade || ""),
        techNote: String(body?.techNote || ""),
        productId,
      });
      if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
      return NextResponse.json(result);
    }

    if (action === "receive") {
      if (!(viewer.isMaintenance || viewer.isAdmin)) {
        return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
      }
      const fromItems = Array.isArray(body?.items)
        ? body!.items
            .filter((item) => item && typeof item.trackingNumber === "string")
            .map((item) => ({
              trackingNumber: String(item.trackingNumber),
              productId:
                Number.isInteger(item.productId) && Number(item.productId) !== 0
                  ? Number(item.productId)
                  : null,
            }))
        : [];
      const fromTrackings = Array.isArray(body?.trackingNumbers)
        ? body!.trackingNumbers
            .filter((item): item is string => typeof item === "string")
            .map((trackingNumber) => ({ trackingNumber, productId: null as number | null }))
        : body?.trackingNumber
          ? [{ trackingNumber: String(body.trackingNumber), productId }]
          : [];
      const list = fromItems.length ? fromItems : fromTrackings;
      const result = await receiveFromMaintenance(list);
      if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
      return NextResponse.json(result);
    }

    if (action === "shelf") {
      if (!(viewer.isMaintenance || viewer.isAdmin)) {
        return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
      }
      const result = await markShelf(String(body?.trackingNumber || ""), productId);
      if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (!(viewer.isMaintenance || viewer.isAdmin)) {
      return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
    }
    const defects = Array.isArray(body?.defects)
      ? body.defects.filter((item): item is string => typeof item === "string")
      : [];
    const destinationRaw = String(body?.destination || "").trim();
    const destinationOverride =
      destinationRaw === "shelf" ||
      destinationRaw === "maintenance" ||
      destinationRaw === "to_customer"
        ? (destinationRaw as "shelf" | "maintenance" | "to_customer")
        : null;
    const result = await saveBostaReturnReview({
      trackingNumber: String(body?.trackingNumber || ""),
      condition: String(body?.condition || ""),
      defects,
      usage: String(body?.usage || ""),
      destinationOverride,
      productId,
    });
    if (!result.ok) {
      return NextResponse.json(
        { message: result.message, ...("detail" in result && result.detail ? { detail: result.detail } : {}) },
        { status: 400 },
      );
    }
    return NextResponse.json({
      review: result.review,
      ...("product" in result && result.product ? { product: result.product } : {}),
    });
  } catch (error) {
    const mapped = maintenanceDbErrorMessage(error);
    console.error("[cs/maintenance/returns] POST", mapped.detail);
    return NextResponse.json(
      { message: mapped.message, detail: mapped.detail.slice(0, 200) },
      { status: 500 },
    );
  }
}
