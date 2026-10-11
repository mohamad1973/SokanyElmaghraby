import { notFound, redirect } from "next/navigation";

import { ensureCsTables } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

import { MonaCourierPanel } from "../../mona/mona-client";

type Props = { params: Promise<{ courierId: string }> };

export default async function MonaCourierAccountPage({ params }: Props) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) redirect("/cs/login");
  await ensureCsTables();
  const viewer = await resolveCsViewer(session.user.csAgentId);
  const allowed = (viewer.isSupervisor || viewer.isAdmin) && !viewer.isCourierSupervisor;
  if (!allowed) redirect("/cs");
  const { courierId } = await params;
  const id = Number(courierId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return <MonaCourierPanel mode="supervisor" focusCourierId={id} />;
}
