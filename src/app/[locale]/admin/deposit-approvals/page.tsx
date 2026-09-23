import { redirect } from "next/navigation";

import { Link } from "@/i18n/navigation";
import { listPendingDepositApprovals } from "@/lib/cs/deposit-approvals";
import { requireAdminSession } from "@/lib/session-guards";

export default async function AdminDepositApprovalsListPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/admin/login");

  const items = await listPendingDepositApprovals();

  return (
    <div className="mx-auto max-w-4xl space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/admin" className="text-sm font-bold underline">
            رجوع
          </Link>
          <h1 className="text-2xl font-extrabold text-[#14213D]">طلبات تأكيد الديبوزت</h1>
          <p className="text-sm text-zinc-600">المعلّقة بانتظار موافقتك ({items.length})</p>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-sm font-bold text-zinc-500 shadow ring-1 ring-black/5">
          لا توجد طلبات ديبوزت معلّقة حالياً.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/admin/deposit-approvals/${item.id}`}
                className="block rounded-2xl bg-white p-4 shadow ring-1 ring-black/5 transition hover:ring-[#0D9488]"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-extrabold text-[#14213D]">#{item.wooOrderNumber}</p>
                    <p className="text-sm font-bold">{item.customerName || "عميل"}</p>
                    <p className="text-xs text-zinc-600" dir="ltr">
                      {item.phone || "—"}
                    </p>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-extrabold text-[#0D9488]">{item.depositAmount ?? "?"} ج.م</p>
                    <p className="text-[11px] text-zinc-500">
                      {item.depositApprovalRequestedAt
                        ? new Date(item.depositApprovalRequestedAt).toLocaleString("ar-EG")
                        : ""}
                    </p>
                    <p className="text-[11px] font-bold text-zinc-600">
                      الوكيلة: {item.assignedAgent?.name || "—"}
                    </p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
