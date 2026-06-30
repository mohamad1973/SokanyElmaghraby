export type FulfillmentMode = "internal" | "bosta";

export const INTERNAL_GOVERNORATE_KEYS = [
  "القاهرة",
  "cairo",
  "القاهره",
  "eg-01",
  "eg-c",
  "الجيزة",
  "giza",
  "الجيزه",
  "eg-02",
  "eg-gz",
];

export function normalizeGovernorateKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

export function isInternalGovernorate(governorate: string) {
  const key = normalizeGovernorateKey(governorate);
  return INTERNAL_GOVERNORATE_KEYS.some((candidate) => key.includes(normalizeGovernorateKey(candidate)));
}

export function resolveFulfillmentMode(governorate: string): FulfillmentMode {
  return isInternalGovernorate(governorate) ? "internal" : "bosta";
}

export const BOSTA_CITY_MAP: Record<string, { code: string; nameAr: string }> = {
  "القاهرة": { code: "EG-01", nameAr: "القاهرة" },
  cairo: { code: "EG-01", nameAr: "القاهرة" },
  "الجيزة": { code: "EG-02", nameAr: "الجيزة" },
  giza: { code: "EG-02", nameAr: "الجيزة" },
  "الإسكندرية": { code: "EG-03", nameAr: "الإسكندرية" },
  alexandria: { code: "EG-03", nameAr: "الإسكندرية" },
  "الدقهلية": { code: "EG-04", nameAr: "الدقهلية" },
  dakahlia: { code: "EG-04", nameAr: "الدقهلية" },
  "البحر الأحمر": { code: "EG-05", nameAr: "البحر الأحمر" },
  "البحيرة": { code: "EG-06", nameAr: "البحيرة" },
  beheira: { code: "EG-06", nameAr: "البحيرة" },
  "الفيوم": { code: "EG-07", nameAr: "الفيوم" },
  fayoum: { code: "EG-07", nameAr: "الفيوم" },
  "الغربية": { code: "EG-08", nameAr: "الغربية" },
  gharbia: { code: "EG-08", nameAr: "الغربية" },
  "الإسماعيلية": { code: "EG-09", nameAr: "الإسماعيلية" },
  ismailia: { code: "EG-09", nameAr: "الإسماعيلية" },
  "المنوفية": { code: "EG-10", nameAr: "المنوفية" },
  monufia: { code: "EG-10", nameAr: "المنوفية" },
  "المنيا": { code: "EG-11", nameAr: "المنيا" },
  minya: { code: "EG-11", nameAr: "المنيا" },
  "القليوبية": { code: "EG-12", nameAr: "القليوبية" },
  qalyubia: { code: "EG-12", nameAr: "القليوبية" },
  "الوادي الجديد": { code: "EG-13", nameAr: "الوادي الجديد" },
  "شمال سيناء": { code: "EG-14", nameAr: "شمال سيناء" },
  "شرق سيناء": { code: "EG-15", nameAr: "شرق سيناء" },
  "كفر الشيخ": { code: "EG-16", nameAr: "كفر الشيخ" },
  "كفرالشيخ": { code: "EG-16", nameAr: "كفر الشيخ" },
  "مطروح": { code: "EG-17", nameAr: "مطروح" },
  matrouh: { code: "EG-17", nameAr: "مطروح" },
  "أسوان": { code: "EG-18", nameAr: "أسوان" },
  aswan: { code: "EG-18", nameAr: "أسوان" },
  "أسيوط": { code: "EG-19", nameAr: "أسيوط" },
  assiut: { code: "EG-19", nameAr: "أسيوط" },
  "بني سويف": { code: "EG-20", nameAr: "بني سويف" },
  "بنيسويف": { code: "EG-20", nameAr: "بني سويف" },
  "بورسعيد": { code: "EG-21", nameAr: "بورسعيد" },
  portsaid: { code: "EG-21", nameAr: "بورسعيد" },
  "دمياط": { code: "EG-22", nameAr: "دمياط" },
  damietta: { code: "EG-22", nameAr: "دمياط" },
  "south sinai": { code: "EG-23", nameAr: "جنوب سيناء" },
  "جنوب سيناء": { code: "EG-23", nameAr: "جنوب سيناء" },
  "سوهاج": { code: "EG-24", nameAr: "سوهاج" },
  sohag: { code: "EG-24", nameAr: "سوهاج" },
  "قنا": { code: "EG-25", nameAr: "قنا" },
  qena: { code: "EG-25", nameAr: "قنا" },
  "الأقصر": { code: "EG-26", nameAr: "الأقصر" },
  luxor: { code: "EG-26", nameAr: "الأقصر" },
};

export function mapGovernorateToBostaCity(governorate: string) {
  const normalized = governorate.trim().toLowerCase();

  if (BOSTA_CITY_MAP[normalized]) {
    return BOSTA_CITY_MAP[normalized];
  }

  for (const [key, value] of Object.entries(BOSTA_CITY_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }

  return { code: "EG-01", nameAr: governorate || "القاهرة" };
}

export const BOSTA_STATUS_LABELS: Record<string, string> = {
  pending: "قيد الانتظار",
  created: "تم الإنشاء",
  picked_up: "تم الاستلام",
  in_transit: "في الطريق",
  out_for_delivery: "خرج للتسليم",
  delivered: "تم التسليم",
  failed: "فشل التسليم",
  cancelled: "ملغي",
  returned: "مرتجع",
  assigned: "معيّن لمندوب",
};

export function getBostaStatusLabelAr(status: string) {
  return BOSTA_STATUS_LABELS[status] || status;
}
