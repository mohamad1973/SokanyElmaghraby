import { NextResponse } from "next/server";

import { changeCustomerPassword, getCustomerSession } from "@/lib/customer-account";

export async function POST(request: Request) {
  const session = await getCustomerSession();

  if (!session) {
    return NextResponse.json({ message: "يجب تسجيل الدخول أولاً." }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as {
    currentPassword?: string;
    newPassword?: string;
  } | null;

  if (!payload?.currentPassword || !payload.newPassword) {
    return NextResponse.json({ message: "كلمة المرور الحالية والجديدة مطلوبتان." }, { status: 400 });
  }

  if (payload.newPassword.length < 8) {
    return NextResponse.json({ message: "كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف." }, { status: 400 });
  }

  if (!session.email) {
    return NextResponse.json({ message: "لا يوجد بريد مرتبط بالحساب لتغيير كلمة المرور." }, { status: 400 });
  }

  try {
    await changeCustomerPassword({
      email: session.email,
      currentPassword: payload.currentPassword,
      newPassword: payload.newPassword,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "تعذر تغيير كلمة المرور." },
      { status: 400 },
    );
  }
}
