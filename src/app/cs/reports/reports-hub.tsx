"use client";

import Link from "next/link";

import { csReportCatalog, type CsReportFlags } from "@/lib/cs/reports-catalog";

import { HomeConfirmReportClient } from "./home-confirm-report-client";
import { MissingInvoiceReportClient } from "./missing-invoice-report-client";
import { ReportsOverview } from "./reports-overview";

export function ReportsHub({
  tab,
  overview,
  flags,
}: {
  tab: "overview" | "home-confirm" | "missing-invoice";
  overview: {
    byStatus: Array<{ status: string; count: number }>;
    byAgent: Array<{ name: string; count: number; confirmed: number }>;
    total: number;
  };
  flags: CsReportFlags;
}) {
  const links = csReportCatalog(flags);
  const canLeadTabs = flags.isSupervisor || flags.isAdmin;
  const canMissingInvoice = flags.isSupervisor || flags.isAdmin || flags.isAccounting;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
        <h1 className="text-xl font-extrabold text-[#14213D]">كل التقارير</h1>
        <p className="mt-1 text-xs font-bold text-[#14213D]/70">
          الروابط بتفتح التقرير في مكانه الأصلي — من غير ما ننقله من مكانه.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="rounded-xl bg-[#F5F5F0] px-3 py-3 ring-1 ring-black/5 transition hover:bg-[#E6B325]/25"
            >
              <p className="text-sm font-extrabold text-[#14213D]">{item.label}</p>
              <p className="mt-1 text-[11px] font-bold leading-4 text-[#14213D]/65">{item.description}</p>
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {canLeadTabs ? (
          <>
            <Link
              href="/cs/reports"
              className={`h-9 rounded-lg px-3 text-xs font-extrabold leading-9 ${
                tab === "overview" ? "bg-[#14213D] text-white" : "bg-[#E5E5E5] text-[#14213D]"
              }`}
            >
              رقابة عامة
            </Link>
            <Link
              href="/cs/reports?tab=home-confirm"
              className={`h-9 rounded-lg px-3 text-xs font-extrabold leading-9 ${
                tab === "home-confirm" ? "bg-[#14213D] text-white" : "bg-[#E5E5E5] text-[#14213D]"
              }`}
            >
              تأكيدات منزل
            </Link>
          </>
        ) : null}
        {canMissingInvoice ? (
          <Link
            href="/cs/reports?tab=missing-invoice"
            className={`h-9 rounded-lg px-3 text-xs font-extrabold leading-9 ${
              tab === "missing-invoice" ? "bg-[#14213D] text-white" : "bg-[#E5E5E5] text-[#14213D]"
            }`}
          >
            بدون فاتورة
          </Link>
        ) : null}
      </div>
      {tab === "home-confirm" && canLeadTabs ? (
        <HomeConfirmReportClient />
      ) : tab === "missing-invoice" && canMissingInvoice ? (
        <MissingInvoiceReportClient />
      ) : canLeadTabs ? (
        <ReportsOverview {...overview} />
      ) : canMissingInvoice ? (
        <MissingInvoiceReportClient />
      ) : null}
    </div>
  );
}
