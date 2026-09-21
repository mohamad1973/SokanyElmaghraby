import { redirect } from "next/navigation";

import { listCsConfirmations, serializeCsQueueItem } from "@/lib/cs/confirmations";
import { ensureDefaultCsAgent } from "@/lib/cs/agents";
import { requireCsSession } from "@/lib/session-guards";

import { CsQueueClient } from "./cs-queue-client";

export default async function CsHomePage() {
  const session = await requireCsSession();
  if (!session) redirect("/cs/login");

  await ensureDefaultCsAgent();
  const rows = await listCsConfirmations();
  const initialItems = rows.map(serializeCsQueueItem);

  return <CsQueueClient initialItems={initialItems} />;
}
