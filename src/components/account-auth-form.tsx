"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { VisualEditableText } from "./visual-editable-text";

type AccountAuthFormProps = {
  mode: "login" | "register";
};

type LoginView = "login" | "forgot-phone" | "forgot-otp";

export function AccountAuthForm({ mode }: AccountAuthFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginView, setLoginView] = useState<LoginView>("login");
  const [otpPhone, setOtpPhone] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setInfoMessage("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);

    if (mode === "register") {
      const response = await fetch("/api/account/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(formData.get("name") || ""),
          email: String(formData.get("email") || ""),
          phone: String(formData.get("phone") || ""),
          password: String(formData.get("password") || ""),
        }),
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      setIsSubmitting(false);

      if (!response.ok) {
        setMessage(result?.message || "تعذر تنفيذ العملية.");
        return;
      }

      router.push("/account");
      router.refresh();
      return;
    }

    if (loginView === "login") {
      const response = await fetch("/api/account/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: String(formData.get("username") || ""),
          password: String(formData.get("password") || ""),
        }),
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      setIsSubmitting(false);

      if (!response.ok) {
        setMessage(result?.message || "تعذر تنفيذ العملية.");
        return;
      }

      router.push("/account");
      router.refresh();
      return;
    }

    if (loginView === "forgot-phone") {
      const phone = String(formData.get("phone") || "");
      const response = await fetch("/api/account/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, purpose: "login" }),
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

      setOtpPhone(phone);
      setLoginView("forgot-otp");
      setInfoMessage(
        result?.testMode
          ? "تم إنشاء كود التحقق. في وضع الاختبار يظهر الكود في ووردبريس: Settings > SOKANY WhatsApp OTP"
          : "تم إرسال كود التحقق على واتساب.",
      );
      return;
    }

    const response = await fetch("/api/account/otp/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: otpPhone,
        otp: String(formData.get("otp") || ""),
      }),
    });
    const result = (await response.json().catch(() => null)) as { message?: string } | null;
    setIsSubmitting(false);

    if (!response.ok) {
      setMessage(result?.message || "كود التحقق غير صحيح.");
      return;
    }

    router.push("/account");
    router.refresh();
  }

  function resetLoginView() {
    setLoginView("login");
    setOtpPhone("");
    setMessage("");
    setInfoMessage("");
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5 rounded-[2rem] bg-white p-6 shadow-sm" dir="rtl">
      {mode === "register" ? (
        <>
          <label className="grid gap-2 text-sm font-bold text-zinc-700">
            <VisualEditableText textKey="account.form.name">الاسم بالكامل</VisualEditableText>
            <input name="name" required className="rounded-2xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold" />
          </label>
          <label className="grid gap-2 text-sm font-bold text-zinc-700">
            <VisualEditableText textKey="account.form.phone">رقم الموبايل</VisualEditableText>
            <input name="phone" required inputMode="tel" className="rounded-2xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold" />
          </label>
          <label className="grid gap-2 text-sm font-bold text-zinc-700">
            <VisualEditableText textKey="account.form.email">البريد الإلكتروني</VisualEditableText>
            <input name="email" required type="email" className="rounded-2xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold" />
          </label>
          <label className="grid gap-2 text-sm font-bold text-zinc-700">
            <VisualEditableText textKey="account.form.password">كلمة المرور</VisualEditableText>
            <input name="password" required type="password" minLength={8} className="rounded-2xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold" />
          </label>
        </>
      ) : loginView === "login" ? (
        <>
          <label className="grid gap-2 text-sm font-bold text-zinc-700">
            <VisualEditableText textKey="account.form.username">البريد الإلكتروني أو اسم المستخدم</VisualEditableText>
            <input name="username" required className="rounded-2xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold" />
          </label>
          <label className="grid gap-2 text-sm font-bold text-zinc-700">
            <VisualEditableText textKey="account.form.password">كلمة المرور</VisualEditableText>
            <input name="password" required type="password" minLength={8} className="rounded-2xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold" />
          </label>
          <button
            type="button"
            onClick={() => {
              setLoginView("forgot-phone");
              setMessage("");
              setInfoMessage("");
            }}
            className="justify-self-start text-sm font-bold text-zinc-700 underline"
          >
            نسيت كلمة المرور؟
          </button>
        </>
      ) : loginView === "forgot-phone" ? (
        <>
          <p className="text-sm leading-7 text-zinc-600">
            أدخل رقم الموبايل المسجّل في حسابك. سنرسل كوداً من 6 أرقام على واتساب.
          </p>
          <label className="grid gap-2 text-sm font-bold text-zinc-700">
            رقم الموبايل
            <input name="phone" required inputMode="tel" className="rounded-2xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold" />
          </label>
          <button type="button" onClick={resetLoginView} className="justify-self-start text-sm font-bold text-zinc-700 underline">
            العودة لتسجيل الدخول
          </button>
        </>
      ) : (
        <>
          <p className="text-sm leading-7 text-zinc-600">
            أدخل كود التحقق المرسل إلى واتساب على الرقم {otpPhone}.
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
          <button
            type="button"
            onClick={() => setLoginView("forgot-phone")}
            className="justify-self-start text-sm font-bold text-zinc-700 underline"
          >
            تغيير رقم الموبايل
          </button>
        </>
      )}

      {infoMessage ? <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{infoMessage}</p> : null}
      {message ? (
        <div className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
          <p>{message}</p>
          {message.includes("حساب") ? (
            <Link href="/account/register" className="mt-2 inline-block underline">
              إنشاء حساب جديد
            </Link>
          ) : null}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-full bg-brand-gold px-6 py-4 text-sm font-bold text-black transition hover:bg-brand-gold-dark disabled:opacity-60"
      >
        {isSubmitting
          ? "جاري التنفيذ..."
          : mode === "register"
            ? "إنشاء الحساب"
            : loginView === "login"
              ? "تسجيل الدخول"
              : loginView === "forgot-phone"
                ? "إرسال الكود"
                : "تأكيد الدخول"}
      </button>
    </form>
  );
}
