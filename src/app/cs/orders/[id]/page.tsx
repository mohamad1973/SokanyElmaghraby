import { notFound, redirect } from "next/navigation";

import { ensureCsTables } from "@/lib/cs/agents";
import { getCsConfirmation, serializeDepositAmount } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

import { CsCallSheet } from "./call-sheet";

type Props = { params: Promise<{ id: string }> };

export default async function CsOrderPage({ params }: Props) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) redirect("/cs/login");

  await ensureCsTables();

  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  const confirmation = await getCsConfirmation(numericId);
  if (!confirmation) notFound();

  const snapshot = (confirmation.customerSnapshot || null) as Parameters<typeof CsCallSheet>[0]["snapshot"];
  const row = confirmation as {
    trackingNumber?: string | null;
    waybillPrinted?: boolean | null;
    depositAmount?: unknown;
    depositPaid?: boolean | null;
    depositPayMethod?: string | null;
    depositFromNumber?: string | null;
    depositToPhone?: string | null;
    depositToMethod?: string | null;
    depositPaidAt?: Date | null;
    depositProofUrl?: string | null;
    depositApprovalStatus?: string | null;
    postCancelInvoice?: string | null;
    postCancelSystemNo?: string | null;
    postCancelRefundPaid?: boolean | null;
    postCancelAt?: Date | null;
    bostaStatus?: string | null;
    bostaShippingFee?: unknown;
    bostaSyncedAt?: Date | null;
    bostaSyncError?: string | null;
    confirmedAt?: Date | null;
    confirmationEditedAt?: Date | null;
  };
  const bostaFee = row.bostaShippingFee == null ? null : Number(row.bostaShippingFee);

  return (
    <CsCallSheet
      confirmationId={confirmation.id}
      status={confirmation.status}
      snapshot={snapshot}
      shippingCompany={confirmation.shippingCompany}
      trackingNumber={row.trackingNumber || snapshot?.trackingNumber || null}
      bostaStatus={row.bostaStatus || null}
      bostaShippingFee={Number.isFinite(bostaFee) ? bostaFee : null}
      bostaSyncedAt={row.bostaSyncedAt ? row.bostaSyncedAt.toISOString() : null}
      bostaSyncError={row.bostaSyncError || null}
      waybillPrinted={Boolean(row.waybillPrinted)}
      depositAmount={serializeDepositAmount(row.depositAmount)}
      depositPaid={Boolean(row.depositPaid)}
      depositPayMethod={row.depositPayMethod || null}
      depositFromNumber={row.depositFromNumber || null}
      depositToPhone={row.depositToPhone || null}
      depositToMethod={row.depositToMethod || null}
      depositPaidAt={row.depositPaidAt ? row.depositPaidAt.toISOString() : null}
      depositProofUrl={row.depositProofUrl || null}
      depositApprovalStatus={row.depositApprovalStatus || null}
      postCancel={{
        invoice: row.postCancelInvoice === "after" ? "after" : row.postCancelInvoice === "before" ? "before" : "",
        systemNo: row.postCancelSystemNo || null,
        refundPaid: Boolean(row.postCancelRefundPaid),
        at: row.postCancelAt ? row.postCancelAt.toISOString() : null,
      }}
      followUp={{
        handedToCarrier: Boolean(confirmation.handedToCarrier),
        deliveredToCustomer: Boolean(confirmation.deliveredToCustomer),
        customerFollowUp: Boolean(confirmation.customerFollowUp),
      }}
      confirmedAt={row.confirmedAt ? row.confirmedAt.toISOString() : null}
      confirmationEditedAt={row.confirmationEditedAt ? row.confirmationEditedAt.toISOString() : null}
      initialAnswers={confirmation.answers.map((a) => ({
        itemKey: a.itemKey,
        confirmed: a.confirmed,
        value: a.value,
        note: a.note,
      }))}
    />
  );
}
