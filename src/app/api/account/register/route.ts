import { NextResponse } from "next/server";

import { createCustomerAccount, normalizeEgyptianPhone, setCustomerSession } from "@/lib/customer-account";

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

  const phone = normalizeEgyptianPhone(payload.phone);

  if (!/^01\d{9}$/.test(phone)) {
    return NextResponse.json(
      { message: "أدخل رقم موبايل صحيح مكوناً من 11 رقماً يبدأ بـ 01." },
      { status: 400 },
    );
  }

  if (payload.password.length < 8) {
    return NextResponse.json({ message: "كلمة المرور يجب ألا تقل عن 8 أحرف." }, { status: 400 });
  }

  try {
    const session = await createCustomerAccount({
      name: payload.name,
      email: payload.email,
      phone,
      password: payload.password,
    });
    await setCustomerSession(session);

    return NextResponse.json({ ok: true, customer: session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر إنشاء الحساب.";

    return NextResponse.json({ message }, { status: 400 });
  }
}
