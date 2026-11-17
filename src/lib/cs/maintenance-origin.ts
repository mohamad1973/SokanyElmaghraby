export type MaintenanceOrigin = "shipping_return" | "unsold_stock";

export const MAINTENANCE_ORIGIN_LABEL: Record<MaintenanceOrigin, string> = {
  shipping_return: "مرتجع شحن",
  unsold_stock: "جديد لم يُبع",
};

export function asMaintenanceOrigin(value: unknown): MaintenanceOrigin {
  return String(value || "").trim() === "unsold_stock" ? "unsold_stock" : "shipping_return";
}

export function originFromCaptureSource(source: string | null | undefined): MaintenanceOrigin {
  return String(source || "").trim() === "unsold_stock" ? "unsold_stock" : "shipping_return";
}

export function originBadgeLabel(origin: MaintenanceOrigin, usage?: "new" | "used" | null) {
  if (origin === "unsold_stock") return MAINTENANCE_ORIGIN_LABEL.unsold_stock;
  if (usage === "new") return "مرتجع شحن · جديد";
  if (usage === "used") return "مرتجع شحن · مستخدم";
  return MAINTENANCE_ORIGIN_LABEL.shipping_return;
}
