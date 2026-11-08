"use client";

import Link from "next/link";

import { HomeConfirmReportClient } from "./home-confirm-report-client";
import { ReportsOverview } from "./reports-overview";

export function ReportsTabs({
  tab,
  overview,
}: {
  tab: "overview" | "home-confirm";
  overview: {
    byStatus: Array<{ status: string; count: number }>;
    byAgent: Array<{ name: string; count: number; confirmed: number }>;
    total: number;
  };
}) {
  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap gap-2">
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
      </div>
      {tab === "home-confirm" ? <HomeConfirmReportClient /> : <ReportsOverview {...overview} />}
    </div>
  );
}
