import { NextResponse } from "next/server";

import { loginCustomerWithOtp, setCustomerSession } from "@/lib/customer-account";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    phone?: string;
    otp?: string;
  } | null;

  if (!payload?.phone || !payload.otp) {
    return NextResponse.json({ message: "رقم الموبايل وكود التحقق مطلوبان." }, { status: 400 });
  }

  try {
    const session = await loginCustomerWithOtp({
      phone: payload.phone,
      otp: payload.otp,
    });
    await setCustomerSession(session);

    return NextResponse.json({ ok: true, customer: session });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "تعذر تسجيل الدخول." },
      { status: 401 },
    );
  }
}
