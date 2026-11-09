import { redirect } from "next/navigation";

import { ensureCsTables } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

import { MonaCourierPanel } from "./mona-client";

export default async function MonaCourierPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) redirect("/cs/login");
  await ensureCsTables();
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.isMonaCourier) redirect("/cs");
  const params = (await searchParams) || {};
  return <MonaCourierPanel mode="courier" initialTab={params.tab === "report" ? "report" : "sheet"} />;
}
