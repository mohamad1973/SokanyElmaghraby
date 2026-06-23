"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AccountLogoutButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function logout() {
    setIsLoading(true);
    await fetch("/api/account/logout", { method: "POST" });
    router.push("/account/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={isLoading}
      className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-bold text-zinc-700 transition hover:border-brand-gold hover:text-black disabled:opacity-60"
    >
      {isLoading ? "جاري الخروج..." : "تسجيل الخروج"}
    </button>
  );
}
