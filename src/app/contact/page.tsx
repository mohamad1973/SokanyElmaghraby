import type { Metadata } from "next";

import { VisualEditableText } from "@/components/visual-editable-text";

export const metadata: Metadata = {
  title: "تواصل معنا",
};

export default function ContactPage() {
  return (
    <div className="py-12">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.8fr_1fr] lg:px-8">
        <aside className="rounded-[2.5rem] bg-zinc-950 p-8 text-white">
          <p className="text-sm font-bold text-brand-gold">
            <VisualEditableText textKey="contact.eyebrow">الدعم</VisualEditableText>
          </p>
          <h1 className="mt-3 text-4xl font-bold">
            <VisualEditableText textKey="contact.title">تواصل معنا</VisualEditableText>
          </h1>
          <p className="mt-5 leading-8 text-zinc-300">
            <VisualEditableText textKey="contact.description">
              صفحة تواصل واضحة تزيد الثقة وتساعد العميل يسأل عن المنتج أو الضمان أو
              حالة الشحن قبل الشراء.
            </VisualEditableText>
          </p>
          <div className="mt-8 space-y-4 text-sm text-zinc-300">
            <p><VisualEditableText textKey="contact.whatsapp">واتساب: يتم إضافة الرقم الرسمي</VisualEditableText></p>
            <p><VisualEditableText textKey="contact.phone">الهاتف: يتم إضافة رقم خدمة العملاء</VisualEditableText></p>
            <p><VisualEditableText textKey="contact.address">العنوان: يتم إضافة بيانات مؤسسة المغربي</VisualEditableText></p>
          </div>
        </aside>

        <section className="rounded-[2.5rem] bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-zinc-950">
            <VisualEditableText textKey="contact.formTitle">أرسل رسالة</VisualEditableText>
          </h2>
          <form className="mt-6 grid gap-5">
            {["الاسم", "رقم الهاتف", "موضوع الرسالة"].map((field) => (
              <input
                key={field}
                className="rounded-2xl border border-black/10 bg-brand-cream px-4 py-3 outline-none transition focus:border-brand-gold focus:bg-white"
                placeholder={field}
              />
            ))}
            <textarea
              className="min-h-36 rounded-2xl border border-black/10 bg-brand-cream px-4 py-3 outline-none transition focus:border-brand-gold focus:bg-white"
              placeholder="اكتب رسالتك"
            />
            <button
              type="button"
              className="rounded-full bg-brand-gold px-8 py-4 text-sm font-bold text-black transition hover:bg-brand-gold-dark"
            >
              <VisualEditableText textKey="contact.submit">إرسال الرسالة</VisualEditableText>
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

