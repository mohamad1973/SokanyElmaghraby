import { redirect } from "next/navigation";

import { listCsConfirmations } from "@/lib/cs/confirmations";
import { ensureDefaultCsAgent } from "@/lib/cs/agents";
import { requireCsSession } from "@/lib/session-guards";

import { CsQueueClient } from "./cs-queue-client";

export default async function CsHomePage() {
  const session = await requireCsSession();
  if (!session) redirect("/cs/login");

  await ensureDefaultCsAgent();
  const rows = await listCsConfirmations();

  const initialItems = rows.map((row) => ({
    id: row.id,
    wooOrderId: row.wooOrderId,
    wooOrderNumber: row.wooOrderNumber,
    status: row.status,
    assignedAgent: row.assignedAgent ? { name: row.assignedAgent.name } : null,
    customerSnapshot: (row.customerSnapshot as {
      customerName?: string;
      phone?: string;
      total?: string;
    } | null) || null,
    createdAt: row.createdAt.toISOString(),
  }));

  return <CsQueueClient initialItems={initialItems} />;
}
