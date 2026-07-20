import { NextResponse } from "next/server";

import { sendContactMessage } from "@/lib/contact-mail";

export const runtime = "nodejs";

type ContactPayload = {
  name?: string;
  phone?: string;
  subject?: string;
  message?: string;
  website?: string;
};

function clean(value: unknown, max: number) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, max);
}

function isValidEgyptianPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

export async function POST(request: Request) {
  let payload: ContactPayload;

  try {
    payload = (await request.json()) as ContactPayload;
  } catch {
    return NextResponse.json({ message: "طلب غير صالح." }, { status: 400 });
  }

  // Honeypot: bots fill this; humans leave it empty
  if (clean(payload.website, 100)) {
    return NextResponse.json({ ok: true });
  }

  const name = clean(payload.name, 120);
  const phone = clean(payload.phone, 30);
  const subject = clean(payload.subject, 160);
  const message = clean(payload.message, 4000);

  if (!name || !phone || !message) {
    return NextResponse.json({ message: "الاسم ورقم الهاتف والرسالة مطلوبة." }, { status: 400 });
  }

  if (!isValidEgyptianPhone(phone)) {
    return NextResponse.json({ message: "رقم الهاتف غير صالح." }, { status: 400 });
  }

  try {
    await sendContactMessage({ name, phone, subject, message });
    return NextResponse.json({ ok: true, message: "تم إرسال رسالتك بنجاح. سنتواصل معك قريباً." });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "تعذر إرسال الرسالة.";
    console.error("[contact]", detail);
    return NextResponse.json(
      {
        message: detail.includes("SMTP") || detail.includes("البريد")
          ? detail
          : "تعذر إرسال الرسالة حالياً. حاول مرة أخرى أو تواصل عبر واتساب.",
      },
      { status: 502 },
    );
  }
}
