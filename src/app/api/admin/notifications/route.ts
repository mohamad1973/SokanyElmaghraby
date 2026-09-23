import { NextResponse } from "next/server";

import {
  countUnreadAdminNotifications,
  listOpenAdminNotifications,
  markAdminNotificationsRead,
} from "@/lib/admin-notifications";
import { listPendingDepositApprovals } from "@/lib/cs/deposit-approvals";
import { requireAdminSession } from "@/lib/session-guards";

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  try {
    const [notifications, deposits, unreadCount] = await Promise.all([
      listOpenAdminNotifications({ limit: 50 }),
      listPendingDepositApprovals(),
      countUnreadAdminNotifications(),
    ]);

    return NextResponse.json({
      notifications,
      deposits,
      unreadCount,
      depositCount: deposits.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تحميل الإشعارات.";
    console.error("[admin/notifications]", message);
    return NextResponse.json({ message: "تعذر تحميل الإشعارات.", detail: message.slice(0, 200) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  let body: { ids?: number[]; markAllRead?: boolean } = {};
  try {
    body = (await request.json()) as { ids?: number[]; markAllRead?: boolean };
  } catch {
    body = {};
  }

  const result = await markAdminNotificationsRead(
    body.markAllRead ? undefined : Array.isArray(body.ids) ? body.ids.filter((n) => Number.isInteger(n)) : undefined,
  );

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
