import { NextResponse } from "next/server";

import { isDatabaseConfigured } from "@/lib/db";
import { runStockAlertCheck } from "@/lib/cs/stock-alerts";

function authorize(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
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

  try {
    const result = await runStockAlertCheck();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "فشل فحص المخزون.";
    return NextResponse.json({ ok: false, message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
