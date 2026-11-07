"use client";

import Link from "next/link";

import { TemimaReturnsClient } from "./temima-returns-client";
import { TemimaSettlementClient } from "./temima-settlement-client";

export function SettlementTabs({
  tab,
  canEdit,
  canEditDeposit,
}: {
  tab: "settlement" | "returns";
  canEdit: boolean;
  canEditDeposit: boolean;
}) {
  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap gap-2">
        <Link
          href="/cs/settlement"
          className={`h-9 rounded-lg px-3 text-xs font-extrabold leading-9 ${
            tab === "settlement" ? "bg-[#14213D] text-white" : "bg-[#E5E5E5] text-[#14213D]"
          }`}
        >
          تصفية سيد تميمة
        </Link>
        <Link
          href="/cs/settlement?tab=returns"
          className={`h-9 rounded-lg px-3 text-xs font-extrabold leading-9 ${
            tab === "returns" ? "bg-[#14213D] text-white" : "bg-[#E5E5E5] text-[#14213D]"
          }`}
        >
          تقرير المرتجعات
        </Link>
      </div>
      {tab === "returns" ? (
        <TemimaReturnsClient />
      ) : (
        <TemimaSettlementClient canEdit={canEdit} canEditDeposit={canEditDeposit} />
      )}
    </div>
  );
}
