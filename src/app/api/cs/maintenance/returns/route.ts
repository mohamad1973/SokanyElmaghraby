import { NextResponse } from "next/server";

import { saveBostaReturnReview } from "@/lib/cs/bosta-return-review";
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

export async function GET(request: Request) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!canHub(viewer)) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  }
  const url = new URL(request.url);
  const range = maintenanceRange(url.searchParams.get("from") || "", url.searchParams.get("to") || "");
  const wantVariance = url.searchParams.get("variance") === "1";
  const [bosta, temima, couriers, variance] = await Promise.all([
    listBostaReceivedReturns(range.from, range.to),
    viewer.isMaintenance || viewer.isAdmin
      ? listTemimaReturns(range.from, range.to)
      : Promise.resolve({ rows: [] }),
    viewer.isMaintenance || viewer.isAdmin
      ? listCourierReturns(range.from, range.to)
      : Promise.resolve({ eid: { found: false, rows: [] }, momen: { found: false, rows: [] } }),
    wantVariance || viewer.isMaintenanceTech || viewer.isMaintenance || viewer.isAdmin
      ? maintenanceVarianceReport(range.from, range.to)
      : Promise.resolve(null),
  ]);
  return NextResponse.json({
    from: range.from,
    to: range.to,
    bosta: { rows: bosta.rows, error: bosta.error },
    temima: { rows: temima.rows },
    eid: couriers.eid,
    momen: couriers.momen,
    variance,
    viewer: {
      isMaintenance: viewer.isMaintenance,
      isMaintenanceTech: viewer.isMaintenanceTech,
      isMaintenanceAccounting: viewer.isMaintenanceAccounting,
      isAdmin: viewer.isAdmin,
    },
  });
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
  const defects = Array.isArray(body?.defects) ? body.defects.filter((item): item is string => typeof item === "string") : [];
  const result = await saveBostaReturnReview({
    trackingNumber: String(body?.trackingNumber || ""),
    condition: String(body?.condition || ""),
    defects,
    usage: String(body?.usage || ""),
  });
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
  return NextResponse.json({ review: result.review });
}
