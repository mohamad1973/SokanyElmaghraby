import { NextResponse } from "next/server";

import { isTransfersRole } from "@/lib/cs/agents";
import { listPendingDepositApprovals } from "@/lib/cs/deposit-approvals";
import { listPendingDiscountApprovals } from "@/lib/cs/discount-approvals";
import { listPendingOrderItemAdds } from "@/lib/cs/order-item-adds";
import { getCsNotificationsForAgent } from "@/lib/cs/notifications";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

export async function GET() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  const viewer = await resolveCsViewer(session.user.csAgentId);
  const isSupervisor = viewer.isSupervisor || Boolean(session.user.csIsSupervisor);
  const isCsAdmin =
    Boolean(session.user.csIsAdmin) || viewer.role === "admin" || session.user.csRole === "admin";
  const transfersOnly = isTransfersRole(viewer.role) || Boolean(session.user.csIsTransfers);

  // Stock threshold is report-only — never surface in the CS notification bell.
  const emptyStock = [] as const;

  // CS store admin: pending deposit/discount approvals + item adds (no agent follow-ups)
  if (isCsAdmin) {
    const [pendingDeposits, pendingDiscounts, pendingItemAdds] = await Promise.all([
      listPendingDepositApprovals(),
      listPendingDiscountApprovals(),
      listPendingOrderItemAdds(),
    ]);
    return NextResponse.json({
      handedToCarrier: [],
      confirmDelivery: [],
      followUpDue: [],
      depositDecisions: [],
      pendingDeposits,
      pendingDiscounts,
      pendingItemAdds,
      stockAlerts: emptyStock,
      totals: {
        handedToCarrier: 0,
        confirmDelivery: 0,
        followUpDue: 0,
        depositDecisions: 0,
        pendingDeposits: pendingDeposits.length,
        pendingDiscounts: pendingDiscounts.length,
        pendingItemAdds: pendingItemAdds.length,
        stockAlerts: 0,
        all: pendingDeposits.length + pendingDiscounts.length + pendingItemAdds.length,
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
      stockAlerts: emptyStock,
      totals: {
        handedToCarrier: 0,
        confirmDelivery: 0,
        followUpDue: 0,
        depositDecisions: 0,
        pendingDeposits: 0,
        stockAlerts: 0,
        all: 0,
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
    stockAlerts: emptyStock,
    totals: {
      ...data.totals,
      pendingDeposits: 0,
      stockAlerts: 0,
      all: data.totals.all,
    },
  });
}
