export function normalizeWhatsAppPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (digits.startsWith("20")) {
    return digits;
  }

  if (digits.startsWith("0")) {
    return `20${digits.slice(1)}`;
  }

  return digits;
}

export function buildWhatsAppUrl(phone: string, message?: string) {
  const normalizedPhone = normalizeWhatsAppPhone(phone);

  if (!normalizedPhone) {
    return "https://wa.me/";
  }

  const url = new URL(`https://wa.me/${normalizedPhone}`);

  if (message?.trim()) {
    url.searchParams.set("text", message.trim());
  }

  return url.toString();
}
