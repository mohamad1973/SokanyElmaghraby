import { NextResponse } from "next/server";

import { getCustomerSession, resetCustomerPasswordWithOtp } from "@/lib/customer-account";

export async function POST(request: Request) {
  const session = await getCustomerSession();

  if (!session) {
    return NextResponse.json({ message: "يجب تسجيل الدخول أولاً." }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as {
    phone?: string;
    otp?: string;
    password?: string;
  } | null;

  if (!payload?.phone || !payload.otp || !payload.password) {
    return NextResponse.json({ message: "رقم الموبايل والكود وكلمة المرور الجديدة مطلوبة." }, { status: 400 });
  }

  if (payload.password.length < 8) {
    return NextResponse.json({ message: "كلمة المرور يجب ألا تقل عن 8 أحرف." }, { status: 400 });
  }

  try {
    await resetCustomerPasswordWithOtp({
      phone: payload.phone,
      otp: payload.otp,
      newPassword: payload.password,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "تعذر تغيير كلمة المرور." },
      { status: 400 },
    );
  }
}
