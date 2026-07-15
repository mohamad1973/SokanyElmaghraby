import Link from "next/link";

export default function AdminReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1d2327]">التقارير</h1>
        <p className="mt-1 text-sm text-zinc-600">تقارير المخزون والتحويل اليومي لمخزن الموقع.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/admin/reports/reorder"
          className="rounded-lg border border-[#c3c4c7] bg-white p-5 shadow-sm transition hover:border-brand-gold hover:shadow-md"
        >
          <p className="text-lg font-bold text-[#1d2327]">حد الطلب</p>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            كميات مخزن الموقع، تعيين حد الطلب، والمنتجات التي تحتاج تحويلاً من المخزن الرئيسي — مع تصدير PDF يومي.
          </p>
        </Link>
      </div>
    </div>
  );
}
