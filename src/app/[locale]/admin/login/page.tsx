import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "دخول لوحة التحكم",
};

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen bg-zinc-100 px-4 py-12">
      <div className="mx-auto max-w-md rounded-2xl border border-black/10 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-gold text-sm font-bold text-black">
            SK
          </span>
          <div>
            <h1 className="text-2xl font-bold text-zinc-950">SOKANY Admin</h1>
            <p className="text-sm text-zinc-500">لوحة تحكم الواجهة والطلبات</p>
          </div>
        </div>

        <Suspense fallback={<p className="mt-8 text-sm text-zinc-500">جاري تحميل نموذج الدخول...</p>}>
          <LoginForm />
        </Suspense>

        <p className="mt-6 rounded-xl bg-zinc-50 p-4 text-xs leading-6 text-zinc-500">
          بيانات التطوير الافتراضية تعمل فقط إذا لم يتم ضبط `ADMIN_EMAIL` و`ADMIN_PASSWORD`
          في ملف البيئة. يجب تغييرها قبل النشر.
        </p>
      </div>
    </div>
  );
}

