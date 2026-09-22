import { NextResponse } from "next/server";

import { canAccessTransfers, isTransfersRole } from "@/lib/cs/agents";
import { getCsNotificationsForAgent } from "@/lib/cs/notifications";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { listOpenStockAlerts } from "@/lib/cs/stock-alerts";
import { requireCsSession } from "@/lib/session-guards";

export async function GET() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  const viewer = await resolveCsViewer(session.user.csAgentId);
  const isSupervisor = viewer.isSupervisor || Boolean(session.user.csIsSupervisor);
  const showTransfers =
    viewer.canAccessTransfers || canAccessTransfers(session.user.csRole) || Boolean(session.user.csCanAccessTransfers);
  const transfersOnly = isTransfersRole(viewer.role) || Boolean(session.user.csIsTransfers);

  const stockAlerts = showTransfers ? await listOpenStockAlerts() : [];

  if (transfersOnly) {
    return NextResponse.json({
      handedToCarrier: [],
      confirmDelivery: [],
      followUpDue: [],
      stockAlerts: stockAlerts.map((a) => ({
        id: a.id,
        productId: a.productId,
        productName: a.productName,
        model: a.model,
        stockQuantity: a.stockQuantity,
        threshold: a.threshold,
      })),
      totals: {
        handedToCarrier: 0,
        confirmDelivery: 0,
        followUpDue: 0,
        stockAlerts: stockAlerts.length,
        all: stockAlerts.length,
      },
    });
  }

  const data = await getCsNotificationsForAgent({
    agentId: session.user.csAgentId,
    isSupervisor,
  });

  return NextResponse.json({
    ...data,
    stockAlerts: stockAlerts.map((a) => ({
      id: a.id,
      productId: a.productId,
      productName: a.productName,
      model: a.model,
      stockQuantity: a.stockQuantity,
      threshold: a.threshold,
    })),
    totals: {
      ...data.totals,
      stockAlerts: stockAlerts.length,
      all: data.totals.all + stockAlerts.length,
    },
  });
}
