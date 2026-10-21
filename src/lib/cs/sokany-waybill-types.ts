export const BOSTA_WAYBILL_COMPANIES = ["bosta"] as const;

export function usesSokanyWaybillPrint(shippingCompany?: string | null, flagged = false) {
  if (flagged) return true;
  const code = String(shippingCompany || "").trim();
  return Boolean(code) && !BOSTA_WAYBILL_COMPANIES.includes(code as (typeof BOSTA_WAYBILL_COMPANIES)[number]);
}

export type SokanyCarrier = {
  id: number;
  code: string;
  nameAr: string;
  waybillProvider: "bosta" | "sokany";
  printHubLabel: string;
  returnAddress: string;
  senderName: string;
  allowOpenPackage: boolean;
  defaultReturnFee: number;
  isActive: boolean;
};

export type SokanyPrintPayload = {
  tracking: string;
  barcodeSvg: string;
  kindLabel: string;
  hubLabel: string;
  senderName: string;
  receiverName: string;
  receiverPhone: string;
  zone: string;
  address: string;
  landmarks: string;
  openPackage: boolean;
  itemsCount: number;
  description: string;
  notes: string;
  invoiceNumber: string;
  orderReference: string;
  legacyRef: string;
  returnAddress: string;
  cod: number;
  returnFee: number;
  createdAt: string;
};
