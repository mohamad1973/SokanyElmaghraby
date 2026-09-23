import { NextResponse } from "next/server";

import { canAccessTransfers, isTransfersRole } from "@/lib/cs/agents";
import { listPendingDepositApprovals } from "@/lib/cs/deposit-approvals";
import { getCsNotificationsForAgent } from "@/lib/cs/notifications";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { listOpenStockAlerts } from "@/lib/cs/stock-alerts";
import { requireCsSession } from "@/lib/session-guards";

function mapStockAlerts(
  stockAlerts: Awaited<ReturnType<typeof listOpenStockAlerts>>,
) {
  return stockAlerts.map((a) => ({
    id: a.id,
    productId: a.productId,
    productName: a.productName,
    model: a.model,
    stockQuantity: a.stockQuantity,
    threshold: a.threshold,
  }));
}

export async function GET() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  const viewer = await resolveCsViewer(session.user.csAgentId);
  const isSupervisor = viewer.isSupervisor || Boolean(session.user.csIsSupervisor);
  const isCsAdmin =
    Boolean(session.user.csIsAdmin) || viewer.role === "admin" || session.user.csRole === "admin";
  const showTransfers =
    viewer.canAccessTransfers || canAccessTransfers(session.user.csRole) || Boolean(session.user.csCanAccessTransfers);
  const transfersOnly = isTransfersRole(viewer.role) || Boolean(session.user.csIsTransfers);

  const stockAlerts = showTransfers || isCsAdmin ? await listOpenStockAlerts() : [];
  const stockMapped = mapStockAlerts(stockAlerts);

  // CS store admin: only pending deposit approvals + stock threshold (no agent follow-ups)
  if (isCsAdmin) {
    const pendingDeposits = await listPendingDepositApprovals();
    return NextResponse.json({
      handedToCarrier: [],
      confirmDelivery: [],
      followUpDue: [],
      depositDecisions: [],
      pendingDeposits,
      stockAlerts: stockMapped,
      totals: {
        handedToCarrier: 0,
        confirmDelivery: 0,
        followUpDue: 0,
        depositDecisions: 0,
        pendingDeposits: pendingDeposits.length,
        stockAlerts: stockMapped.length,
        all: pendingDeposits.length + stockMapped.length,
      },
    });
  }

  if (transfersOnly) {
    return NextResponse.json({
      handedToCarrier: [],
      confirmDelivery: [],
      followUpDue: [],
      depositDecisions: [],
      pendingDeposits: [],
      stockAlerts: stockMapped,
      totals: {
        handedToCarrier: 0,
        confirmDelivery: 0,
        followUpDue: 0,
        depositDecisions: 0,
        pendingDeposits: 0,
        stockAlerts: stockMapped.length,
        all: stockMapped.length,
      },
    });
  }

  const data = await getCsNotificationsForAgent({
    agentId: session.user.csAgentId,
    isSupervisor,
  });

  return NextResponse.json({
    ...data,
    pendingDeposits: [],
    stockAlerts: stockMapped,
    totals: {
      ...data.totals,
      pendingDeposits: 0,
      stockAlerts: stockMapped.length,
      all: data.totals.all + stockMapped.length,
    },
  });
}
