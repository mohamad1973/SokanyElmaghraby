/** Central catalog of CS report deep-links (existing locations; nothing moved). */

export type CsReportLink = {
  id: string;
  label: string;
  href: string;
  description: string;
};

export type CsReportFlags = {
  isSupervisor: boolean;
  isAdmin: boolean;
  isAccounting: boolean;
  canSettlement: boolean;
  canTransfers: boolean;
  canMaintenanceHub: boolean;
  canBosta: boolean;
  canMonaAccounts: boolean;
  isMonaCourier: boolean;
  isCourierSupervisor: boolean;
  canSeeOrders: boolean;
};

export function csReportCatalog(flags: CsReportFlags): CsReportLink[] {
  const items: Array<CsReportLink & { show: boolean }> = [
    {
      id: "overview",
      label: "رقابة عامة",
      href: "/cs/reports",
      description: "ملخص الأوردرات حسب الحالة والمسؤول",
      show: flags.isSupervisor || flags.isAdmin,
    },
    {
      id: "home-confirm",
      label: "تأكيدات منزل",
      href: "/cs/reports?tab=home-confirm",
      description: "أداء موظفات تأكيد المنزل حسب الفترة",
      show: flags.isSupervisor || flags.isAdmin,
    },
    {
      id: "missing-invoice",
      label: "بدون فاتورة",
      href: "/cs/reports?tab=missing-invoice",
      description: "أوردرات محفوظة من غير رقم فاتورة",
      show: flags.isSupervisor || flags.isAdmin || flags.isAccounting,
    },
    {
      id: "temima-returns",
      label: "مرتجعات تميمة",
      href: "/cs/settlement?tab=returns",
      description: "تقرير أسبوعي قراءة فقط (الغاء / لم يسجل / استرجاع)",
      show: flags.canSettlement,
    },
    {
      id: "bosta-reconcile",
      label: "مطابقة بوسطة",
      href: "/cs/bosta?tab=reconcile",
      description: "نزل المخزن مقابل استلام بوسطة",
      show: flags.canBosta,
    },
    {
      id: "mona-report",
      label: "تقرير مؤمن / عيد",
      href: flags.isMonaCourier ? "/cs/mona?tab=report" : "/cs/mona-accounts",
      description: flags.isMonaCourier
        ? "تقرير الفترة لمندوب المشرفة"
        : "افتح حساب مندوب ثم تبويب التقرير",
      show: flags.canMonaAccounts || flags.isMonaCourier,
    },
    {
      id: "transfers",
      label: "تحويل المخازن",
      href: "/cs/transfers",
      description: "أصناف تحت حد الطلب وكمية التحويل للطباعة",
      show: flags.canTransfers,
    },
    {
      id: "maintenance-variance",
      label: "فروقات الصيانة",
      href: "/cs/maintenance?hub=variance",
      description: "مسلّم للصيانة ولم يعد في المدى",
      show: flags.canMaintenanceHub,
    },
    {
      id: "late",
      label: "أوردرات متأخرة",
      href: "/cs?late=1",
      description: "متأخرة في التسليم (شيت سيد)",
      show: flags.isCourierSupervisor || ((flags.isSupervisor || flags.isAdmin) && flags.canSeeOrders),
    },
    {
      id: "reorder",
      label: "حد الطلب",
      href: "/ar/admin/reports/reorder",
      description: "مخزون الموقع وحد الطلب وتصدير PDF",
      show: flags.isAdmin,
    },
    {
      id: "dispatch",
      label: "تقارير التوصيل",
      href: "/ar/admin/dispatch/reports",
      description: "أداء مناديب الدسباتش والتسليم وCOD",
      show: flags.isAdmin,
    },
  ];
  return items.filter((item) => item.show).map(({ show: _show, ...rest }) => rest);
}
