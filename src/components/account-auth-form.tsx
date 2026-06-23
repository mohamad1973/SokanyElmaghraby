"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

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
            الاسم بالكامل
            <input name="name" required className="rounded-2xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold" />
          </label>
          <label className="grid gap-2 text-sm font-bold text-zinc-700">
            رقم الموبايل
            <input name="phone" required inputMode="tel" className="rounded-2xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold" />
          </label>
          <label className="grid gap-2 text-sm font-bold text-zinc-700">
            البريد الإلكتروني
            <input name="email" required type="email" className="rounded-2xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold" />
          </label>
        </>
      ) : (
        <label className="grid gap-2 text-sm font-bold text-zinc-700">
          البريد الإلكتروني أو اسم المستخدم
          <input name="username" required className="rounded-2xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold" />
        </label>
      )}

      <label className="grid gap-2 text-sm font-bold text-zinc-700">
        كلمة المرور
        <input name="password" required type="password" minLength={8} className="rounded-2xl border border-black/10 px-4 py-3 outline-none focus:border-brand-gold" />
      </label>

      {message ? <p className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{message}</p> : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-full bg-brand-gold px-6 py-4 text-sm font-bold text-black transition hover:bg-brand-gold-dark disabled:opacity-60"
      >
        {isSubmitting ? "جاري التنفيذ..." : mode === "register" ? "إنشاء الحساب" : "تسجيل الدخول"}
      </button>
    </form>
  );
}
