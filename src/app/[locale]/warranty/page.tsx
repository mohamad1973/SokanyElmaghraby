import type { Metadata } from "next";

import { VisualEditableText } from "@/components/visual-editable-text";

export const metadata: Metadata = {
  title: "الضمان والصيانة",
  description: "ضمان منتجات سوكاني الأصلية من مؤسسة المغربي الوكيل الحصري في مصر.",
};

const items = [
  { key: "manufacturing", text: "ضمان لمدة عام كامل ضد عيوب الصناعة." },
  { key: "original", text: "منتجات أصلية من مؤسسة المغربي الوكيل الحصري في مصر." },
  { key: "support", text: "خدمة متابعة بعد البيع وتأكيد بيانات الطلب." },
  { key: "policy", text: "توفير معلومات واضحة عن سياسة الاستبدال والاسترجاع." },
];

export default function WarrantyPage() {
  return (
    <div className="py-12">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-[2.5rem] bg-white p-8 shadow-sm">
          <p className="text-sm font-bold text-brand-gold">
            <VisualEditableText textKey="warranty.eyebrow">الضمان</VisualEditableText>
          </p>
          <h1 className="mt-3 text-4xl font-bold text-zinc-950">
            <VisualEditableText textKey="warranty.title">الضمان والصيانة</VisualEditableText>
          </h1>
          <p className="mt-5 text-lg leading-9 text-zinc-600">
            <VisualEditableText textKey="warranty.description">
              صفحة الثقة من أهم الصفحات التجارية، لأنها ترد على تردد العميل قبل
              الشراء وتوضح أن المنتج أصلي بضمان رسمي من الوكيل.
            </VisualEditableText>
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {items.map((item) => (
              <div key={item.key} className="rounded-3xl bg-brand-cream p-5 font-bold leading-7 text-zinc-800">
                <VisualEditableText textKey={`warranty.item.${item.key}`}>{item.text}</VisualEditableText>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

