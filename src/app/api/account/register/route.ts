import { NextResponse } from "next/server";

import { createCustomerAccount, setCustomerSession } from "@/lib/customer-account";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    name?: string;
    email?: string;
    phone?: string;
    password?: string;
  } | null;

  if (!payload?.name || !payload.email || !payload.phone || !payload.password) {
    return NextResponse.json({ message: "الاسم والبريد ورقم الموبايل وكلمة المرور مطلوبة." }, { status: 400 });
  }

  if (payload.password.length < 8) {
    return NextResponse.json({ message: "كلمة المرور يجب ألا تقل عن 8 أحرف." }, { status: 400 });
  }

  try {
    const session = await createCustomerAccount({
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      password: payload.password,
    });
    await setCustomerSession(session);

    return NextResponse.json({ ok: true, customer: session });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "تعذر إنشاء الحساب." },
      { status: 500 },
    );
  }
}
