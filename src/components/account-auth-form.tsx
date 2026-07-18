"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { VisualEditableText } from "./visual-editable-text";

type AccountAuthFormProps = {
  mode: "login" | "register";
};

type LoginView = "login" | "forgot-phone" | "forgot-otp";

function formatPhoneDisplay(phone: string) {
  if (phone.length !== 11) {
    return phone;
  }

  return `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`;
}

export function AccountAuthForm({ mode }: AccountAuthFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginView, setLoginView] = useState<LoginView>("login");
  const [otpPhone, setOtpPhone] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [otpInput, setOtpInput] = useState("");

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
        const rawMessage = result?.message || "تعذر تنفيذ العملية.";
        let friendlyMessage = rawMessage;

        try {
          const parsed = JSON.parse(rawMessage) as { message?: string };
          if (typeof parsed.message === "string" && parsed.message.trim()) {
            friendlyMessage = parsed.message.trim();
          }
        } catch {
          // already plain text
        }

        setMessage(friendlyMessage);
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
      const phone = phoneInput;

      if (!/^01\d{9}$/.test(phone)) {
        setIsSubmitting(false);
        setMessage("أدخل رقم موبايل صحيح مكوناً من 11 رقماً يبدأ بـ 01.");
        return;
      }

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
      setOtpInput("");
      setLoginView("forgot-otp");
      setInfoMessage(
        result?.testMode
          ? "تم إرسال الكود. في وضع الاختبار: Settings > SOKANY WhatsApp OTP"
          : "تم إرسال الكود على واتساب.",
      );
      return;
    }

    const response = await fetch("/api/account/otp/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: otpPhone,
        otp: otpInput,
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
    setPhoneInput("");
    setOtpInput("");
    setMessage("");
    setInfoMessage("");
  }

  function goToResendCode() {
    setPhoneInput(otpPhone);
    setOtpInput("");
    setLoginView("forgot-phone");
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
            <input
              name="phone"
              required
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              dir="ltr"
              placeholder="01XXXXXXXXX"
              maxLength={11}
              pattern="01[0-9]{9}"
              title="أدخل 11 رقماً يبدأ بـ 01"
              className="rounded-2xl border border-black/10 px-4 py-3 text-center text-lg font-bold tracking-[0.2em] tabular-nums outline-none focus:border-brand-gold"
            />
            <span className="text-xs font-normal text-zinc-400">11 رقم يبدأ بـ 01 بدون مسافات</span>
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
          <h2 className="text-xl font-bold text-zinc-950">أدخل رقم الموبايل</h2>
          <label className="grid gap-2 text-sm font-bold text-zinc-700">
            رقم الموبايل
            <input
              name="phone"
              required
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              dir="ltr"
              placeholder="01XXXXXXXXX"
              maxLength={11}
              pattern="01[0-9]{9}"
              value={phoneInput}
              onChange={(event) => setPhoneInput(event.target.value.replace(/\D/g, "").slice(0, 11))}
              className="rounded-2xl border border-black/10 px-4 py-4 text-center text-xl font-bold tracking-[0.25em] tabular-nums outline-none focus:border-brand-gold"
            />
            <span className={`text-xs font-normal ${phoneInput.length === 11 ? "text-emerald-600" : "text-zinc-400"}`} dir="rtl">
              {phoneInput.length}/11 رقم
            </span>
          </label>
          <button type="button" onClick={resetLoginView} className="justify-self-start text-sm font-bold text-zinc-700 underline">
            العودة لتسجيل الدخول
          </button>
        </>
      ) : (
        <>
          <h2 className="text-xl font-bold text-zinc-950">أدخل كود التحقق</h2>
          <p className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600" dir="rtl">
            تم الإرسال إلى:{" "}
            <span className="font-bold text-zinc-950 tabular-nums" dir="ltr">
              {formatPhoneDisplay(otpPhone)}
            </span>
          </p>
          <label className="grid gap-2 text-sm font-bold text-zinc-700">
            كود التحقق (6 أرقام)
            <input
              name="otp"
              required
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              dir="ltr"
              placeholder="000000"
              maxLength={6}
              value={otpInput}
              onChange={(event) => setOtpInput(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="rounded-2xl border-2 border-brand-gold/30 bg-zinc-50 px-4 py-4 text-center text-2xl font-bold tracking-[0.5em] tabular-nums outline-none focus:border-brand-gold"
            />
            <span className={`text-xs font-normal ${otpInput.length === 6 ? "text-emerald-600" : "text-zinc-400"}`} dir="rtl">
              {otpInput.length}/6 أرقام
            </span>
          </label>
          <button type="button" onClick={goToResendCode} className="justify-self-start text-sm font-bold text-zinc-700 underline">
            إعادة إرسال الكود
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
        disabled={
          isSubmitting ||
          (mode === "login" && loginView === "forgot-phone" && phoneInput.length !== 11) ||
          (mode === "login" && loginView === "forgot-otp" && otpInput.length !== 6)
        }
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
