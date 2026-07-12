import { NextResponse } from "next/server";

import { requestOtp, type OtpPurpose } from "@/lib/whatsapp-otp";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    phone?: string;
    purpose?: OtpPurpose;
  } | null;

  if (!payload?.phone) {
    return NextResponse.json({ message: "رقم الموبايل مطلوب." }, { status: 400 });
  }

  const purpose = payload.purpose || "login";

  if (!["login", "reset_password", "register"].includes(purpose)) {
    return NextResponse.json({ message: "نوع طلب التحقق غير صالح." }, { status: 400 });
  }

  try {
    const result = await requestOtp(payload.phone, purpose);

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: result.status,
          message: result.message,
        },
        { status: 404 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "تعذر إرسال كود التحقق." },
      { status: 500 },
    );
  }
}
