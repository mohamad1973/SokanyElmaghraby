"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const result = await signIn("admin-credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
      callbackUrl: searchParams.get("callbackUrl") || "/admin",
    });

    setIsLoading(false);

    if (result?.error) {
      setError("بيانات الدخول غير صحيحة.");
      return;
    }

    router.push(result?.url || "/admin");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 grid gap-5">
      <label className="grid gap-2 text-sm font-bold text-zinc-700">
        البريد الإلكتروني
        <input
          name="email"
          type="email"
          required
          className="rounded-xl border border-black/10 bg-white px-4 py-3 outline-none transition focus:border-brand-gold"
          placeholder="admin@sokany-eg.com"
        />
      </label>

      <label className="grid gap-2 text-sm font-bold text-zinc-700">
        كلمة المرور
        <input
          name="password"
          type="password"
          required
          className="rounded-xl border border-black/10 bg-white px-4 py-3 outline-none transition focus:border-brand-gold"
          placeholder="••••••••"
        />
      </label>

      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <button
        type="submit"
        disabled={isLoading}
        className="rounded-xl bg-brand-gold px-5 py-3 text-sm font-bold text-black transition hover:bg-brand-gold-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading ? "جاري الدخول..." : "دخول لوحة التحكم"}
      </button>
    </form>
  );
}

