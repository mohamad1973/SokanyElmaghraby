"use client";

import { useState, type FormEvent } from "react";

import { VisualEditableText } from "@/components/visual-editable-text";

export function ContactForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedMessage = message.trim();

    if (!trimmedName || !trimmedPhone || !trimmedMessage) {
      setError("الاسم ورقم الهاتف والرسالة مطلوبة.");
      return;
    }

    const digits = trimmedPhone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) {
      setError("أدخل رقم هاتف صحيح.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          phone: trimmedPhone,
          subject: subject.trim(),
          message: trimmedMessage,
          website,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { message?: string; ok?: boolean } | null;

      if (!response.ok) {
        setError(payload?.message || "تعذر إرسال الرسالة.");
        return;
      }

      setSuccess(payload?.message || "تم إرسال رسالتك بنجاح.");
      setName("");
      setPhone("");
      setSubject("");
      setMessage("");
      setWebsite("");
    } catch {
      setError("تعذر الاتصال بالخادم. حاول مرة أخرى.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mt-6 grid gap-5" onSubmit={onSubmit} noValidate>
      <input
        name="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoComplete="name"
        required
        className="rounded-2xl border border-black/10 bg-brand-cream px-4 py-3 outline-none transition focus:border-brand-gold focus:bg-white"
        placeholder="الاسم"
      />
      <input
        name="phone"
        type="tel"
        inputMode="tel"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        autoComplete="tel"
        required
        className="rounded-2xl border border-black/10 bg-brand-cream px-4 py-3 outline-none transition focus:border-brand-gold focus:bg-white"
        placeholder="رقم الهاتف"
      />
      <input
        name="subject"
        value={subject}
        onChange={(event) => setSubject(event.target.value)}
        className="rounded-2xl border border-black/10 bg-brand-cream px-4 py-3 outline-none transition focus:border-brand-gold focus:bg-white"
        placeholder="موضوع الرسالة"
      />
      <textarea
        name="message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        required
        className="min-h-36 rounded-2xl border border-black/10 bg-brand-cream px-4 py-3 outline-none transition focus:border-brand-gold focus:bg-white"
        placeholder="اكتب رسالتك"
      />
      {/* Honeypot — hidden from users */}
      <input
        name="website"
        value={website}
        onChange={(event) => setWebsite(event.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />

      {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p> : null}
      {success ? (
        <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{success}</p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-full bg-brand-gold px-8 py-4 text-sm font-bold text-black transition hover:bg-brand-gold-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "جارٍ الإرسال..." : <VisualEditableText textKey="contact.submit">إرسال الرسالة</VisualEditableText>}
      </button>
    </form>
  );
}
