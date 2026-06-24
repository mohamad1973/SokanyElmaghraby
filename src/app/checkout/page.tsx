import type { Metadata } from "next";

import { VisualEditableText } from "@/components/visual-editable-text";

export const metadata: Metadata = {
  title: "إتمام الطلب",
  description: "إتمام طلب منتجات سوكاني مع دعم فوري أو كاش عند الاستلام.",
};

const fields = [
  { key: "name", label: "الاسم بالكامل" },
  { key: "phone", label: "رقم الهاتف" },
  { key: "governorate", label: "المحافظة" },
  { key: "address", label: "العنوان بالتفصيل" },
];

export default function CheckoutPage() {
  return (
    <div className="py-12">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_0.7fr] lg:px-8">
        <section className="rounded-[2.5rem] bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-bold text-brand-gold">
            <VisualEditableText textKey="checkout.eyebrow">إتمام الطلب</VisualEditableText>
          </p>
          <h1 className="mt-3 text-4xl font-bold text-zinc-950">
            <VisualEditableText textKey="checkout.title">إتمام الطلب</VisualEditableText>
          </h1>
          <p className="mt-4 leading-8 text-zinc-600">
            <VisualEditableText textKey="checkout.description">
              نموذج أولي لتجربة checkout. عند ربط WooCommerce سيتم إرسال الطلبات
              للوحة WordPress، وعند اختيار فوري سيتم تحويل العميل لمسار الدفع وتأكيد
              الحالة عبر callback/webhook.
            </VisualEditableText>
          </p>
          <p className="mt-3 rounded-2xl bg-brand-cream p-4 text-sm leading-7 text-zinc-700">
            <VisualEditableText textKey="checkout.accountNote">
              عند تسجيل دخول العميل سيتم ربط الطلب بحسابه في ووردبريس، ويمكن لاحقاً استخدام نقاط الولاء كخصم من إجمالي الطلب.
            </VisualEditableText>
          </p>

          <form className="mt-8 grid gap-5">
            {fields.map((field) => (
              <label key={field.key} className="grid gap-2 text-sm font-bold text-zinc-700">
                <VisualEditableText textKey={`checkout.field.${field.key}`}>{field.label}</VisualEditableText>
                <input
                  className="rounded-2xl border border-black/10 bg-brand-cream px-4 py-3 outline-none transition focus:border-brand-gold focus:bg-white"
                  placeholder={field.label}
                />
              </label>
            ))}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="rounded-2xl border border-brand-gold bg-brand-cream p-4">
                <input type="radio" name="payment" defaultChecked className="ml-2" />
                <span className="font-bold">
                  <VisualEditableText textKey="checkout.payment.fawry">الدفع عبر فوري</VisualEditableText>
                </span>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  <VisualEditableText textKey="checkout.payment.fawryDescription">دفع إلكتروني آمن بعد تأكيد الطلب.</VisualEditableText>
                </p>
              </label>
              <label className="rounded-2xl border border-black/10 bg-white p-4">
                <input type="radio" name="payment" className="ml-2" />
                <span className="font-bold">
                  <VisualEditableText textKey="checkout.payment.cod">كاش عند الاستلام</VisualEditableText>
                </span>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  <VisualEditableText textKey="checkout.payment.codDescription">الدفع عند وصول الطلب للعميل.</VisualEditableText>
                </p>
              </label>
            </div>

            <button
              type="button"
              className="rounded-full bg-brand-gold px-8 py-4 text-sm font-bold text-black transition hover:bg-brand-gold-dark"
            >
              <VisualEditableText textKey="checkout.confirm">تأكيد الطلب</VisualEditableText>
            </button>
          </form>
        </section>

        <aside className="h-fit rounded-[2.5rem] bg-zinc-950 p-6 text-white shadow-sm sm:p-8">
          <h2 className="text-2xl font-bold">
            <VisualEditableText textKey="checkout.summary.title">ملخص الطلب</VisualEditableText>
          </h2>
          <div className="mt-6 space-y-4 text-sm">
            <div className="flex justify-between border-b border-white/10 pb-4">
              <span className="text-zinc-300"><VisualEditableText textKey="checkout.summary.products">المنتجات</VisualEditableText></span>
              <span className="font-bold"><VisualEditableText textKey="checkout.summary.productsValue">يتم حسابها من السلة</VisualEditableText></span>
            </div>
            <div className="flex justify-between border-b border-white/10 pb-4">
              <span className="text-zinc-300"><VisualEditableText textKey="checkout.summary.shipping">الشحن</VisualEditableText></span>
              <span className="font-bold"><VisualEditableText textKey="checkout.summary.shippingValue">حسب المحافظة</VisualEditableText></span>
            </div>
            <div className="flex justify-between text-lg">
              <span className="text-zinc-300"><VisualEditableText textKey="checkout.summary.total">الإجمالي</VisualEditableText></span>
              <span className="font-bold text-brand-gold"><VisualEditableText textKey="checkout.summary.totalValue">بعد الربط</VisualEditableText></span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

