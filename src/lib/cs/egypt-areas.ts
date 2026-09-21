/** Static governorates + common Greater Cairo areas for CS filters/assignment. */

import { BOSTA_CITY_MAP } from "@/lib/shipping/bosta-zones";

const AREA_BY_GOVERNORATE: Record<string, string[]> = {
  القاهرة: [
    "مدينة نصر",
    "مصر الجديدة",
    "المعادي",
    "حلوان",
    "شبرا",
    "وسط البلد",
    "التجمع الخامس",
    "عين شمس",
    "الزمالك",
    "مصر القديمة",
    "المقطم",
    "العباسية",
    "حدائق القبة",
    "الوايلي",
  ],
  الجيزة: [
    "الدقي",
    "المهندسين",
    "فيصل",
    "6 أكتوبر",
    "الهرم",
    "الشيخ زايد",
    "إمبابة",
    "العجوزة",
    "بولاق الدكرور",
    "البدرشين",
  ],
  الإسكندرية: ["سموحة", "المنتزه", "العجمي", "محرم بك", "سيدي جابر", "ميامي"],
};

export function listCsGovernorates() {
  const names = new Set<string>();
  for (const entry of Object.values(BOSTA_CITY_MAP)) {
    if (entry.nameAr) names.add(entry.nameAr);
  }
  for (const key of Object.keys(AREA_BY_GOVERNORATE)) names.add(key);
  return [...names].sort((a, b) => a.localeCompare(b, "ar"));
}

export function listCsAreasForGovernorate(governorate: string) {
  const key = governorate.trim();
  return AREA_BY_GOVERNORATE[key] || [];
}

export function mergeAreaOptions(governorate: string, fromOrders: string[]) {
  const set = new Set<string>([...listCsAreasForGovernorate(governorate), ...fromOrders.filter(Boolean)]);
  return [...set].sort((a, b) => a.localeCompare(b, "ar"));
}
