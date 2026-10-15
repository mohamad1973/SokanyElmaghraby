import { NextResponse } from "next/server";

import { captureBostaHeadingReturns } from "@/lib/cs/bosta-return-capture";
import { cairoClock } from "@/lib/cs/order-window";
import { isDatabaseConfigured } from "@/lib/db";

function authorize(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    const isVercelCron = request.headers.get("x-vercel-cron") === "1";
    return isVercelCron || process.env.NODE_ENV !== "production";
  }
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

function insideHeadingWindow() {
  const clock = cairoClock(new Date().toISOString());
  if (!clock) return false;
  const hour = Math.floor(clock.minutes / 60);
  return hour >= 12 && hour < 14;
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ message: "DATABASE_URL غير مضبوط." }, { status: 503 });
  }
  if (!insideHeadingWindow()) {
    return NextResponse.json({ ok: true, skipped: true });
  }
  try {
    const result = await captureBostaHeadingReturns();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "فشل حفظ مرتجعات بوسطة.";
    return NextResponse.json({ ok: false, message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
