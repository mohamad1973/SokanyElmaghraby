import Link from "next/link";

import { AccountAuthForm } from "@/components/account-auth-form";
import { VisualEditableText } from "@/components/visual-editable-text";

export const metadata = {
  title: "إنشاء حساب",
};

export default function RegisterPage() {
  return (
    <div className="py-12">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.9fr_1fr] lg:px-8">
        <div className="flex flex-col justify-center">
          <h1 className="text-4xl font-bold text-zinc-950">
            <VisualEditableText textKey="account.register.title">إنشاء حساب عميل</VisualEditableText>
          </h1>
          <p className="mt-4 leading-8 text-zinc-600">
            <VisualEditableText textKey="account.register.description">
              الحساب يتم إنشاؤه داخل ووردبريس/ووكومرس مباشرة، ويجب إدخال رقم الموبايل حتى يتم استخدامه لاحقاً في التحقق OTP ومتابعة الطلب.
            </VisualEditableText>
          </p>
          <p className="mt-5 text-sm font-bold text-zinc-600">
            <VisualEditableText textKey="account.register.loginPrompt">لديك حساب؟</VisualEditableText>{" "}
            <Link href="/account/login" className="text-black underline">
              <VisualEditableText textKey="account.register.loginLink">سجل الدخول</VisualEditableText>
            </Link>
          </p>
        </div>
        <AccountAuthForm mode="register" />
      </div>
    </div>
  );
}
