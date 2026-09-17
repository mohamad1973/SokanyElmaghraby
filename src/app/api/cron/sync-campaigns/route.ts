import { NextResponse } from "next/server";

import { isDatabaseConfigured } from "@/lib/db";
import { syncExpiredCampaigns } from "@/lib/group-buy/sync-campaigns";

function authorize(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // بدون سر: اسمح فقط من داخل Vercel Cron (header خاص) أو تطوير محلي
    const isVercelCron = request.headers.get("x-vercel-cron") === "1";
    return isVercelCron || process.env.NODE_ENV !== "production";
  }

  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ message: "DATABASE_URL غير مضبوط." }, { status: 503 });
  }

  const result = await syncExpiredCampaigns();
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: Request) {
  return GET(request);
}
