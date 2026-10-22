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
  listCourierReturns,
  listTemimaReturns,
  maintenanceRange,
} from "@/lib/cs/maintenance-returns";
import { requireCsSession } from "@/lib/session-guards";

function canHub(viewer: Awaited<ReturnType<typeof resolveCsViewer>>) {
  return Boolean(viewer.canAccessMaintenanceHub || viewer.isMaintenance);
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
    const range = maintenanceRange(url.searchParams.get("from") || "", url.searchParams.get("to") || "");
    const wantVariance = url.searchParams.get("variance") === "1";
    const loadTemima = viewer.isMaintenance || viewer.isAdmin;
    const loadCouriers = viewer.isMaintenance || viewer.isAdmin;
    const loadVariance = wantVariance || viewer.isMaintenanceTech || viewer.isMaintenance || viewer.isAdmin;

    const [bosta, temima, couriers, variance] = await Promise.all([
      settledValue(
        listBostaReceivedReturns(range.from, range.to),
        { rows: [], error: "تعذر تحميل مرتجعات بوسطة.", detail: null },
        "bosta",
      ),
      loadTemima
        ? settledValue(listTemimaReturns(range.from, range.to), { rows: [], error: null, detail: null }, "temima")
        : Promise.resolve({ rows: [], error: null, detail: null }),
      loadCouriers
        ? settledValue(
            listCourierReturns(range.from, range.to),
            {
              eid: { found: false, rows: [], error: null, detail: null },
              momen: { found: false, rows: [], error: null, detail: null },
            },
            "couriers",
          )
        : Promise.resolve({
            eid: { found: false, rows: [], error: null, detail: null },
            momen: { found: false, rows: [], error: null, detail: null },
          }),
      loadVariance
        ? settledValue(maintenanceVarianceReport(range.from, range.to), null, "variance")
        : Promise.resolve(null),
    ]);

    const failed = [
      { error: bosta.error, detail: bosta.detail },
      { error: temima.error, detail: temima.detail },
      { error: couriers.eid.error, detail: couriers.eid.detail },
      { error: couriers.momen.error, detail: couriers.momen.detail },
    ].find((section) => section.error);
    return NextResponse.json({
      from: range.from,
      to: range.to,
      bosta: { rows: bosta.rows, error: bosta.error },
      temima: { rows: temima.rows, error: temima.error },
      eid: { found: couriers.eid.found, rows: couriers.eid.rows, error: couriers.eid.error },
      momen: { found: couriers.momen.found, rows: couriers.momen.rows, error: couriers.momen.error },
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
    condition?: string;
    defects?: unknown;
    usage?: string;
    note?: string;
    grade?: string;
    techNote?: string;
  } | null;

  const action = String(body?.action || "review");

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
      });
      if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
      return NextResponse.json(result);
    }

    if (action === "receive") {
      if (!(viewer.isMaintenance || viewer.isAdmin)) {
        return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
      }
      const list = Array.isArray(body?.trackingNumbers)
        ? body!.trackingNumbers.filter((item): item is string => typeof item === "string")
        : body?.trackingNumber
          ? [String(body.trackingNumber)]
          : [];
      const result = await receiveFromMaintenance(list);
      if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
      return NextResponse.json(result);
    }

    if (action === "shelf") {
      if (!(viewer.isMaintenance || viewer.isAdmin)) {
        return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
      }
      const result = await markShelf(String(body?.trackingNumber || ""));
      if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (!(viewer.isMaintenance || viewer.isAdmin)) {
      return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
    }
    const defects = Array.isArray(body?.defects)
      ? body.defects.filter((item): item is string => typeof item === "string")
      : [];
    const result = await saveBostaReturnReview({
      trackingNumber: String(body?.trackingNumber || ""),
      condition: String(body?.condition || ""),
      defects,
      usage: String(body?.usage || ""),
    });
    if (!result.ok) {
      return NextResponse.json(
        { message: result.message, ...("detail" in result && result.detail ? { detail: result.detail } : {}) },
        { status: 400 },
      );
    }
    return NextResponse.json({ review: result.review });
  } catch (error) {
    const mapped = maintenanceDbErrorMessage(error);
    console.error("[cs/maintenance/returns] POST", mapped.detail);
    return NextResponse.json(
      { message: mapped.message, detail: mapped.detail.slice(0, 200) },
      { status: 500 },
    );
  }
}
