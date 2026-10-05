import { redirect } from "next/navigation";

import { ensureCsTables, ensureDefaultCsAgent } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { listCourierAgents } from "@/lib/cs/courier-dispatch";
import { cairoTodayYmd } from "@/lib/cs/order-window";
import { listTemimaCutoffs } from "@/lib/cs/temima-cutoff";
import { listTemimaSheetEdits, listUnifiedSayedSheet } from "@/lib/cs/temima-sheet-edits";
import { openSettlementMarks } from "@/lib/cs/temima-settlement";
import { requireCsSession } from "@/lib/session-guards";

import { CsQueueClient } from "../cs-queue-client";

export default async function CsTemimaSheetPage() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) redirect("/cs/login");

  await ensureCsTables();
  await ensureDefaultCsAgent();

  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.isAdmin && !viewer.isSupervisor && !viewer.isCourierSupervisor) redirect("/cs");

  const today = cairoTodayYmd();
  const [sheet, temimaSheetEdits, couriers, temimaCutoffs] = await Promise.all([
    listUnifiedSayedSheet(today, today),
    listTemimaSheetEdits(),
    listCourierAgents(),
    listTemimaCutoffs(),
  ]);
  const marks = await openSettlementMarks(sheet.map((item) => item.id));
  const items = sheet.map((item) => ({
    ...item,
    settlementDisposition: (marks.get(item.id) || "") as "" | "collect" | "return" | "postpone",
  }));

  return (
    <CsQueueClient
      initialItems={items}
      isSupervisor={false}
      isAccounting={false}
      agents={[]}
      couriers={couriers}
      isCourierSupervisor
      showOfficialMarks
      canPressOfficial={viewer.isCourierSupervisor || viewer.isAdmin}
      canOpenOrders={viewer.isAdmin}
      canEditTemimaSheet={viewer.isAdmin}
      canEditInvoice={viewer.isAdmin || viewer.isSupervisor}
      canPrintQueue={viewer.isAdmin || (viewer.isSupervisor && !viewer.isCourierSupervisor)}
      temimaCutoffs={temimaCutoffs}
      temimaSheetEdits={temimaSheetEdits}
    />
  );
}
