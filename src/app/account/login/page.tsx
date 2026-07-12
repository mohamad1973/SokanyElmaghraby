import Link from "next/link";

import { AccountAuthForm } from "@/components/account-auth-form";
import { VisualEditableText } from "@/components/visual-editable-text";

export const metadata = {
  title: "تسجيل الدخول",
};

export default function LoginPage() {
  return (
    <div className="py-12">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.9fr_1fr] lg:px-8">
        <div className="flex flex-col justify-center">
          <h1 className="text-4xl font-bold text-zinc-950">
            <VisualEditableText textKey="account.login.title">تسجيل الدخول</VisualEditableText>
          </h1>
          <p className="mt-5 text-sm font-bold text-zinc-600">
            <VisualEditableText textKey="account.login.registerPrompt">لا تملك حساباً؟</VisualEditableText>{" "}
            <Link href="/account/register" className="text-black underline">
              <VisualEditableText textKey="account.login.registerLink">أنشئ حساب جديد</VisualEditableText>
            </Link>
          </p>
        </div>
        <AccountAuthForm mode="login" />
      </div>
    </div>
  );
}
