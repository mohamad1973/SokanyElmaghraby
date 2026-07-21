import { getDriverReports } from "@/lib/dispatch/drivers";

export const dynamic = "force-dynamic";

export default async function DispatchReportsPage() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const reports = await getDriverReports(from, now);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">تقارير التوصيل</h1>
        <p className="mt-2 text-sm text-zinc-600">أداء المندوبين — التسليم، الفشل، وCOD المحصّل.</p>
      </div>

      <div className="overflow-auto rounded-md border border-black/10 bg-white">
        <table className="min-w-[800px] w-full text-right text-sm">
          <thead className="bg-zinc-50">
            <tr>
              <th className="px-4 py-3">المندوب</th>
              <th className="px-4 py-3">عدد المسارات</th>
              <th className="px-4 py-3">الطلبات</th>
              <th className="px-4 py-3">تم التسليم</th>
              <th className="px-4 py-3">فشل</th>
              <th className="px-4 py-3">COD</th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">لا توجد بيانات بعد.</td>
              </tr>
            ) : (
              reports.map((report) => (
                <tr key={report.driverId} className="border-t">
                  <td className="px-4 py-3 font-bold">{report.driverName}</td>
                  <td className="px-4 py-3">{report.totalRuns}</td>
                  <td className="px-4 py-3">{report.totalAssignments}</td>
                  <td className="px-4 py-3 text-green-700">{report.delivered}</td>
                  <td className="px-4 py-3 text-red-700">{report.failed}</td>
                  <td className="px-4 py-3">{report.codTotal}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
