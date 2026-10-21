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
  senderNameAr: string;
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
  returnAddress: string;
  cod: number;
  returnFee: number;
  createdAt: string;
};
