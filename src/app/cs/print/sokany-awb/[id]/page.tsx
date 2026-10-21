import { notFound, redirect } from "next/navigation";

import { ensureCsTables } from "@/lib/cs/agents";
import { ensureCsSokanyWaybill, toSokanyPrintPayload } from "@/lib/cs/sokany-waybill";
import { getPrismaClient } from "@/lib/db";
import { requireCsSession } from "@/lib/session-guards";

import { SokanyAwbSticker } from "./sticker";

type Props = { params: Promise<{ id: string }> };

export default async function SokanyAwbPrintPage({ params }: Props) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) redirect("/cs/login");
  await ensureCsTables();
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  const result = await ensureCsSokanyWaybill(numericId);
  if (!result.ok) {
    return (
      <main dir="rtl" className="min-h-screen bg-white p-6 text-[#14213D]">
        <p className="text-lg font-extrabold">{result.message}</p>
      </main>
    );
  }
  const prisma = getPrismaClient();
  const row = await prisma?.csOrderConfirmation.findUnique({
    where: { id: numericId },
    select: { wooOrderNumber: true },
  });
  const payload = toSokanyPrintPayload(result.waybill, result.carrier, row?.wooOrderNumber || "");
  return <SokanyAwbSticker payload={payload} confirmationId={numericId} />;
}
