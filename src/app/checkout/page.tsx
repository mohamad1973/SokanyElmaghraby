import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "إتمام الطلب",
  description: "إتمام طلب منتجات سوكاني مع دعم فوري أو كاش عند الاستلام.",
};

const fields = ["الاسم بالكامل", "رقم الهاتف", "المحافظة", "العنوان بالتفصيل"];

export default function CheckoutPage() {
  return (
    <div className="py-12">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_0.7fr] lg:px-8">
        <section className="rounded-[2.5rem] bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-bold text-brand-gold">Checkout</p>
          <h1 className="mt-3 text-4xl font-bold text-zinc-950">إتمام الطلب</h1>
          <p className="mt-4 leading-8 text-zinc-600">
            نموذج أولي لتجربة checkout. عند ربط WooCommerce سيتم إرسال الطلبات
            للوحة WordPress، وعند اختيار فوري سيتم تحويل العميل لمسار الدفع وتأكيد
            الحالة عبر callback/webhook.
          </p>
          <p className="mt-3 rounded-2xl bg-brand-cream p-4 text-sm leading-7 text-zinc-700">
            عند تسجيل دخول العميل سيتم ربط الطلب بحسابه في ووردبريس، ويمكن لاحقاً استخدام نقاط الولاء كخصم من إجمالي الطلب.
          </p>

          <form className="mt-8 grid gap-5">
            {fields.map((field) => (
              <label key={field} className="grid gap-2 text-sm font-bold text-zinc-700">
                {field}
                <input
                  className="rounded-2xl border border-black/10 bg-brand-cream px-4 py-3 outline-none transition focus:border-brand-gold focus:bg-white"
                  placeholder={field}
                />
              </label>
            ))}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="rounded-2xl border border-brand-gold bg-brand-cream p-4">
                <input type="radio" name="payment" defaultChecked className="ml-2" />
                <span className="font-bold">الدفع عبر فوري</span>
                <p className="mt-2 text-sm leading-6 text-zinc-600">دفع إلكتروني آمن بعد تأكيد الطلب.</p>
              </label>
              <label className="rounded-2xl border border-black/10 bg-white p-4">
                <input type="radio" name="payment" className="ml-2" />
                <span className="font-bold">كاش عند الاستلام</span>
                <p className="mt-2 text-sm leading-6 text-zinc-600">الدفع عند وصول الطلب للعميل.</p>
              </label>
            </div>

            <button
              type="button"
              className="rounded-full bg-brand-gold px-8 py-4 text-sm font-bold text-black transition hover:bg-brand-gold-dark"
            >
              تأكيد الطلب
            </button>
          </form>
        </section>

        <aside className="h-fit rounded-[2.5rem] bg-zinc-950 p-6 text-white shadow-sm sm:p-8">
          <h2 className="text-2xl font-bold">ملخص الطلب</h2>
          <div className="mt-6 space-y-4 text-sm">
            <div className="flex justify-between border-b border-white/10 pb-4">
              <span className="text-zinc-300">المنتجات</span>
              <span className="font-bold">يتم حسابها من السلة</span>
            </div>
            <div className="flex justify-between border-b border-white/10 pb-4">
              <span className="text-zinc-300">الشحن</span>
              <span className="font-bold">حسب المحافظة</span>
            </div>
            <div className="flex justify-between text-lg">
              <span className="text-zinc-300">الإجمالي</span>
              <span className="font-bold text-brand-gold">بعد الربط</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

