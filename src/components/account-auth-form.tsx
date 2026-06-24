"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { VisualEditableText } from "./visual-editable-text";

type AccountAuthFormProps = {
  mode: "login" | "register";
};

export function AccountAuthForm({ mode }: AccountAuthFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const endpoint = mode === "register" ? "/api/account/register" : "/api/account/login";
    const payload = mode === "register"
      ? {
          name: String(formData.get("name") || ""),
          email: String(formData.get("email") || ""),
          phone: String(formData.get("phone") || ""),
          password: String(formData.get("password") || ""),
        }
      : {
          username: String(formData.get("username") || ""),
          password: String(formData.get("password") || ""),
        };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const result = (await response.json().catch(() => null)) as { message?: string } | null;

    setIsSubmitting(false);

    if (!response.ok) {
      setMessage(result?.message || "تعذر تنفيذ العملية.");
      return;
    }

    router.push("/account");
    router.refresh();
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
        </>
      ) : (
        <label className="grid gap-2 text-sm font-bold text-zinc-700">
          <VisualEditableText textKey="account.form.username">البريد الإلكتروني أو اسم المستخدم</VisualEditableText>
          <input name="username" required className="rounded-2xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold" />
        </label>
      )}

      <label className="grid gap-2 text-sm font-bold text-zinc-700">
        <VisualEditableText textKey="account.form.password">كلمة المرور</VisualEditableText>
        <input name="password" required type="password" minLength={8} className="rounded-2xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold" />
      </label>

      {message ? <p className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{message}</p> : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-full bg-brand-gold px-6 py-4 text-sm font-bold text-black transition hover:bg-brand-gold-dark disabled:opacity-60"
      >
        {isSubmitting ? (
          <VisualEditableText textKey="account.form.submitting">جاري التنفيذ...</VisualEditableText>
        ) : mode === "register" ? (
          <VisualEditableText textKey="account.form.registerSubmit">إنشاء الحساب</VisualEditableText>
        ) : (
          <VisualEditableText textKey="account.form.loginSubmit">تسجيل الدخول</VisualEditableText>
        )}
      </button>
    </form>
  );
}
