import { notFound, redirect } from "next/navigation";

import { ensureCsTables } from "@/lib/cs/agents";
import { getCsConfirmation, serializeDepositAmount, startCsConfirmation } from "@/lib/cs/confirmations";
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

  let confirmation = await getCsConfirmation(numericId);
  if (!confirmation) notFound();

  if (confirmation.status !== "CONFIRMED" && confirmation.status !== "FAILED_CONTACT" && confirmation.status !== "CANCELLED") {
    const started = await startCsConfirmation(numericId, session.user.csAgentId);
    if (started.ok) {
      confirmation = started.confirmation;
    }
  }

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
    salesOrderNumber?: string | null;
    postCancelInvoice?: string | null;
    postCancelSystemNo?: string | null;
    postCancelRefundPaid?: boolean | null;
    postCancelAt?: Date | null;
  };

  return (
    <CsCallSheet
      confirmationId={confirmation.id}
      status={confirmation.status}
      snapshot={snapshot}
      shippingCompany={confirmation.shippingCompany}
      trackingNumber={row.trackingNumber || snapshot?.trackingNumber || null}
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
      salesOrderNumber={row.salesOrderNumber || null}
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
      initialAnswers={confirmation.answers.map((a) => ({
        itemKey: a.itemKey,
        confirmed: a.confirmed,
        value: a.value,
        note: a.note,
      }))}
    />
  );
}
