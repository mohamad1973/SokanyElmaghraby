import { NextResponse } from "next/server";

import { loginCustomerWithWordPress, setCustomerSession } from "@/lib/customer-account";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    username?: string;
    password?: string;
  } | null;

  if (!payload?.username || !payload.password) {
    return NextResponse.json({ message: "البريد أو اسم المستخدم وكلمة المرور مطلوبة." }, { status: 400 });
  }

  try {
    const session = await loginCustomerWithWordPress({
      username: payload.username,
      password: payload.password,
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
