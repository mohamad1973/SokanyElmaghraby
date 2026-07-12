"use client";

import { FormEvent, useState } from "react";

type AccountChangePasswordFormProps = {
  phone: string;
};

type PasswordView = "current" | "otp-request" | "otp-verify" | "otp-password";

export function AccountChangePasswordForm({ phone }: AccountChangePasswordFormProps) {
  const [view, setView] = useState<PasswordView>("current");
  const [message, setMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [otpCode, setOtpCode] = useState("");

  const hasPhone = Boolean(phone?.trim());

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setInfoMessage("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);

    if (view === "current") {
      const currentPassword = String(formData.get("currentPassword") || "");
      const newPassword = String(formData.get("newPassword") || "");
      const confirmPassword = String(formData.get("confirmPassword") || "");

      if (newPassword !== confirmPassword) {
        setIsSubmitting(false);
        setMessage("كلمة المرور الجديدة وتأكيدها غير متطابقين.");
        return;
      }

      const response = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      setIsSubmitting(false);

      if (!response.ok) {
        setMessage(result?.message || "تعذر تغيير كلمة المرور.");
        return;
      }

      setInfoMessage("تم تغيير كلمة المرور بنجاح.");
      event.currentTarget.reset();
      return;
    }

    if (view === "otp-request") {
      const response = await fetch("/api/account/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, purpose: "reset_password" }),
      });
      const result = (await response.json().catch(() => null)) as {
        message?: string;
        testMode?: boolean;
      } | null;
      setIsSubmitting(false);

      if (!response.ok) {
        setMessage(result?.message || "تعذر إرسال كود التحقق.");
        return;
      }

      setView("otp-verify");
      setInfoMessage(
        result?.testMode
          ? "تم إنشاء كود التحقق. في وضع الاختبار يظهر الكود في ووردبريس: Settings > SOKANY WhatsApp OTP"
          : `تم إرسال كود التحقق على واتساب إلى ${phone}.`,
      );
      return;
    }

    if (view === "otp-verify") {
      const otp = String(formData.get("otp") || "");
      setOtpCode(otp);
      setView("otp-password");
      setIsSubmitting(false);
      setInfoMessage("أدخل كلمة المرور الجديدة.");
      return;
    }

    const newPassword = String(formData.get("newPassword") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    if (newPassword !== confirmPassword) {
      setIsSubmitting(false);
      setMessage("كلمة المرور الجديدة وتأكيدها غير متطابقين.");
      return;
    }

    const response = await fetch("/api/account/otp/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        otp: otpCode,
        password: newPassword,
      }),
    });
    const result = (await response.json().catch(() => null)) as { message?: string } | null;
    setIsSubmitting(false);

    if (!response.ok) {
      setMessage(result?.message || "تعذر تغيير كلمة المرور.");
      if (result?.message?.includes("كود") || result?.message?.includes("OTP")) {
        setView("otp-verify");
        setOtpCode("");
      }
      return;
    }

    setView("current");
    setOtpCode("");
    setInfoMessage("تم تغيير كلمة المرور بنجاح.");
    event.currentTarget.reset();
  }

  function resetToCurrent() {
    setView("current");
    setOtpCode("");
    setMessage("");
    setInfoMessage("");
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 grid gap-5" dir="rtl">
      {view === "current" ? (
        <>
          <label className="grid gap-2 text-sm font-bold text-zinc-700">
            كلمة المرور الحالية
            <input
              name="currentPassword"
              required
              type="password"
              autoComplete="current-password"
              className="rounded-2xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-zinc-700">
            كلمة المرور الجديدة
            <input
              name="newPassword"
              required
              type="password"
              minLength={8}
              autoComplete="new-password"
              className="rounded-2xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-zinc-700">
            تأكيد كلمة المرور الجديدة
            <input
              name="confirmPassword"
              required
              type="password"
              minLength={8}
              autoComplete="new-password"
              className="rounded-2xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
            />
          </label>
          {hasPhone ? (
            <button
              type="button"
              onClick={() => {
                setView("otp-request");
                setMessage("");
                setInfoMessage("");
              }}
              className="justify-self-start text-sm font-bold text-zinc-700 underline"
            >
              نسيت كلمة المرور الحالية؟
            </button>
          ) : (
            <p className="text-sm leading-7 text-zinc-600">
              أضف رقم موبايل لحسابك من ووردبريس أو تواصل مع الدعم لتغيير كلمة المرور عبر واتساب.
            </p>
          )}
        </>
      ) : view === "otp-request" ? (
        <>
          <p className="text-sm leading-7 text-zinc-600">
            سنرسل كود تحقق من 6 أرقام على واتساب إلى الرقم المسجّل في حسابك: {phone}
          </p>
          <button type="button" onClick={resetToCurrent} className="justify-self-start text-sm font-bold text-zinc-700 underline">
            العودة لتغيير كلمة المرور بالكلمة الحالية
          </button>
        </>
      ) : view === "otp-verify" ? (
        <>
          <p className="text-sm leading-7 text-zinc-600">
            أدخل كود التحقق المرسل إلى واتساب على الرقم {phone}.
          </p>
          <label className="grid gap-2 text-sm font-bold text-zinc-700">
            كود التحقق
            <input
              name="otp"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="rounded-2xl border border-black/10 px-4 py-3 tracking-[0.4em] outline-none focus:border-brand-gold"
            />
          </label>
          <button type="button" onClick={() => setView("otp-request")} className="justify-self-start text-sm font-bold text-zinc-700 underline">
            إعادة إرسال الكود
          </button>
        </>
      ) : (
        <>
          <p className="text-sm leading-7 text-zinc-600">أدخل كلمة المرور الجديدة لحسابك.</p>
          <label className="grid gap-2 text-sm font-bold text-zinc-700">
            كلمة المرور الجديدة
            <input
              name="newPassword"
              required
              type="password"
              minLength={8}
              autoComplete="new-password"
              className="rounded-2xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-zinc-700">
            تأكيد كلمة المرور الجديدة
            <input
              name="confirmPassword"
              required
              type="password"
              minLength={8}
              autoComplete="new-password"
              className="rounded-2xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold"
            />
          </label>
          <button type="button" onClick={() => setView("otp-verify")} className="justify-self-start text-sm font-bold text-zinc-700 underline">
            تعديل كود التحقق
          </button>
        </>
      )}

      {infoMessage ? <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{infoMessage}</p> : null}
      {message ? <p className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{message}</p> : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-fit rounded-full bg-brand-gold px-6 py-3 text-sm font-bold text-black transition hover:bg-brand-gold-dark disabled:opacity-60"
      >
        {isSubmitting
          ? "جاري التنفيذ..."
          : view === "current"
            ? "حفظ كلمة المرور"
            : view === "otp-request"
              ? "إرسال الكود"
              : view === "otp-verify"
                ? "متابعة"
                : "تأكيد كلمة المرور الجديدة"}
      </button>
    </form>
  );
}
