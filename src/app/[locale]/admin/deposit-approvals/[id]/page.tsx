import { notFound, redirect } from "next/navigation";

import { getDepositApprovalById } from "@/lib/cs/deposit-approvals";
import { requireAdminSession } from "@/lib/session-guards";

import { DepositApprovalClient } from "./deposit-approval-client";

type Props = { params: Promise<{ id: string }> };

export default async function AdminDepositApprovalPage({ params }: Props) {
  const session = await requireAdminSession();
  if (!session) redirect("/admin/login");

  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  const item = await getDepositApprovalById(numericId);
  if (!item) notFound();

  return <DepositApprovalClient item={item} />;
}
