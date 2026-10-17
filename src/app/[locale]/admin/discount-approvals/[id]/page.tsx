import { notFound, redirect } from "next/navigation";

import { getDiscountApprovalById } from "@/lib/cs/discount-approvals";
import { requireAdminSession } from "@/lib/session-guards";

import { DiscountApprovalClient } from "./discount-approval-client";

type Props = { params: Promise<{ id: string }> };

export default async function AdminDiscountApprovalPage({ params }: Props) {
  const session = await requireAdminSession();
  if (!session) redirect("/admin/login");

  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  const item = await getDiscountApprovalById(numericId);
  if (!item) notFound();

  return <DiscountApprovalClient item={item} />;
}
