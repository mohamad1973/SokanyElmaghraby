import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "الضمان والصيانة",
  description: "ضمان منتجات سوكاني الأصلية من مؤسسة المغربي الوكيل الحصري في مصر.",
};

const items = [
  "ضمان لمدة عام كامل ضد عيوب الصناعة.",
  "منتجات أصلية من مؤسسة المغربي الوكيل الحصري في مصر.",
  "خدمة متابعة بعد البيع وتأكيد بيانات الطلب.",
  "توفير معلومات واضحة عن سياسة الاستبدال والاسترجاع.",
];

export default function WarrantyPage() {
  return (
    <div className="py-12">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-[2.5rem] bg-white p-8 shadow-sm">
          <p className="text-sm font-bold text-brand-gold">Warranty</p>
          <h1 className="mt-3 text-4xl font-bold text-zinc-950">الضمان والصيانة</h1>
          <p className="mt-5 text-lg leading-9 text-zinc-600">
            صفحة الثقة من أهم الصفحات التجارية، لأنها ترد على تردد العميل قبل
            الشراء وتوضح أن المنتج أصلي بضمان رسمي من الوكيل.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {items.map((item) => (
              <div key={item} className="rounded-3xl bg-brand-cream p-5 font-bold leading-7 text-zinc-800">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

