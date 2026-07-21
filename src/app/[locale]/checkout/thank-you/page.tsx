import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "شكراً لطلبك",
  description: "تم استلام طلبك بنجاح.",
};

type ThankYouPageProps = {
  searchParams: Promise<{
    order?: string;
    payment?: string;
  }>;
};

export default async function CheckoutThankYouPage({ searchParams }: ThankYouPageProps) {
  const params = await searchParams;
  const orderNumber = params.order?.trim() || "";
  const payment = params.payment?.trim() || "";

  const isFawryReturn = payment === "fawry";
  const isFawryPending = payment === "fawry-pending";

  return (
    <div className="py-12">
      <div className="mx-auto max-w-2xl rounded-[2.5rem] bg-white p-8 text-center shadow-sm sm:p-10">
        <p className="text-sm font-bold text-brand-gold">تم استلام الطلب</p>
        <h1 className="mt-3 text-4xl font-bold text-zinc-950">شكراً لك</h1>
        <p className="mt-4 leading-8 text-zinc-600">
          {isFawryReturn
            ? "شكراً لإتمام الدفع عبر فوري. سنبدأ تجهيز طلبك فور تأكيد العملية."
            : isFawryPending
              ? "تم إنشاء طلبك. أكمل الدفع عبر فوري من رسالة التأكيد أو من حسابك إن لزم."
              : "تم تأكيد طلبك بنجاح. سنرسل تأكيداً عبر واتساب على رقم الهاتف المسجّل مع الطلب."}
        </p>

        {orderNumber ? (
          <p className="mt-6 rounded-2xl bg-brand-cream px-5 py-4 text-base font-bold text-zinc-900">
            رقم الطلب: <span dir="ltr">{orderNumber}</span>
          </p>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/shop"
            className="inline-flex rounded-full bg-brand-gold px-7 py-3 text-sm font-bold text-black transition hover:bg-brand-gold-dark"
          >
            متابعة التسوق
          </Link>
          <Link
            href="/account"
            className="inline-flex rounded-full border border-black/10 px-7 py-3 text-sm font-bold text-zinc-800 transition hover:border-brand-gold"
          >
            حسابي
          </Link>
        </div>
      </div>
    </div>
  );
}
