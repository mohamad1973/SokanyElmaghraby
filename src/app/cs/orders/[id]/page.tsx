import { notFound, redirect } from "next/navigation";

import { ensureCsTables } from "@/lib/cs/agents";
import { getCsConfirmation, startCsConfirmation } from "@/lib/cs/confirmations";
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

  return (
    <CsCallSheet
      confirmationId={confirmation.id}
      status={confirmation.status}
      snapshot={snapshot}
      shippingCompany={confirmation.shippingCompany}
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
