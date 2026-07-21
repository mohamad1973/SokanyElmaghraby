import { ReorderReportClient } from "./reorder-report-client";

export default function AdminReorderReportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1d2327]">تقرير حد الطلب</h1>
        <p className="mt-1 text-sm text-zinc-600">
          يعرض أصناف مخزن الموقع (WooCommerce): الاسم، SKU، الكمية، وحد الطلب. صدّر PDF يومياً لتحويل البضاعة من المخزن
          الرئيسي إلى مخزن الأونلاين.
        </p>
      </div>

      <ReorderReportClient />
    </div>
  );
}
