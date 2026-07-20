import type { Metadata } from "next";

import { ContactForm } from "@/components/contact-form";
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
              مؤسسة المغربي مؤسسة عريقة تسعى لخدمة العملاء وإرضائهم، ونرحب بتواصلكم معنا لأي
              استفسار عن المنتجات أو الضمان أو الشحن.
            </VisualEditableText>
          </p>
          <div className="mt-8 space-y-4 text-sm text-zinc-300">
            <p>
              <VisualEditableText textKey="contact.whatsapp">واتساب: يتم إضافة الرقم الرسمي</VisualEditableText>
            </p>
            <p>
              <VisualEditableText textKey="contact.phone">الهاتف: يتم إضافة رقم خدمة العملاء</VisualEditableText>
            </p>
            <p>
              <VisualEditableText textKey="contact.address">العنوان: يتم إضافة بيانات مؤسسة المغربي</VisualEditableText>
            </p>
          </div>
        </aside>

        <section className="rounded-[2.5rem] bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-zinc-950">
            <VisualEditableText textKey="contact.formTitle">أرسل رسالة</VisualEditableText>
          </h2>
          <ContactForm />
        </section>
      </div>
    </div>
  );
}
