"use client";

export function ReportsOverview({
  byStatus,
  byAgent,
  total,
}: {
  byStatus: Array<{ status: string; count: number }>;
  byAgent: Array<{ name: string; count: number; confirmed: number }>;
  total: number;
}) {
  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
        <h1 className="text-2xl font-extrabold text-[#14213D]">تقارير الرقابة</h1>
        <p className="mt-1 text-sm font-bold text-[#14213D]/70">
          ملخص أوردرات القائمة الحالية ({total}) حسب الحالة والمسؤول.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {byStatus.map((row) => (
          <div key={row.status} className="rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
            <p className="text-xs font-bold text-[#14213D]/60">{row.status}</p>
            <p className="mt-1 text-2xl font-extrabold text-[#14213D]">{row.count}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white shadow ring-1 ring-[#14213D]/10">
        <table className="min-w-full text-sm">
          <thead className="bg-[#E5E5E5] text-right text-[#14213D]">
            <tr>
              <th className="px-3 py-2">المسؤول</th>
              <th className="px-3 py-2">أوردرات معيّنة</th>
              <th className="px-3 py-2">تم الحفظ</th>
            </tr>
          </thead>
          <tbody>
            {byAgent.map((row) => (
              <tr key={row.name} className="border-t border-[#E5E5E5]">
                <td className="px-3 py-2 font-bold">{row.name}</td>
                <td className="px-3 py-2">{row.count}</td>
                <td className="px-3 py-2">{row.confirmed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
