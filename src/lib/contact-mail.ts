import nodemailer from "nodemailer";

export type ContactMessageInput = {
  name: string;
  phone: string;
  subject: string;
  message: string;
};

function requireSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || "465");
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.CONTACT_FROM_EMAIL?.trim() || user;
  const to = process.env.CONTACT_TO_EMAIL?.trim() || "info@sokanyelmaghraby.com";

  if (!host || !user || !pass || !from) {
    throw new Error(
      "إعداد البريد غير مكتمل. يلزم SMTP_HOST و SMTP_USER و SMTP_PASS و CONTACT_FROM_EMAIL على الخادم.",
    );
  }

  return { host, port, user, pass, from, to };
}

export async function sendContactMessage(input: ContactMessageInput) {
  const { host, port, user, pass, from, to } = requireSmtpConfig();
  const secure = port === 465;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  const subjectLine = `[تواصل الموقع] ${input.subject || input.name}`.slice(0, 180);
  const text = [
    "رسالة جديدة من نموذج تواصل الموقع",
    "",
    `الاسم: ${input.name}`,
    `الهاتف: ${input.phone}`,
    `الموضوع: ${input.subject || "—"}`,
    "",
    "الرسالة:",
    input.message,
  ].join("\n");

  await transporter.sendMail({
    from,
    to,
    subject: subjectLine,
    text,
    replyTo: from,
  });

  return { ok: true as const, to };
}
