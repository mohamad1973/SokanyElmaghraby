import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "سياسة الاسترجاع",
};

export default function ReturnPolicyPage() {
  return (
    <div className="py-12">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <article className="rounded-[2.5rem] bg-white p-8 shadow-sm">
          <p className="text-sm font-bold text-brand-gold">Policy</p>
          <h1 className="mt-3 text-4xl font-bold text-zinc-950">سياسة الاسترجاع</h1>
          <div className="mt-6 space-y-5 leading-8 text-zinc-600">
            <p>
              هذه صفحة مبدئية سيتم ضبط نصها النهائي حسب سياسة مؤسسة المغربي
              الرسمية، وهي ضرورية لثقة العميل وتحسين قبول بوابات الدفع.
            </p>
            <p>
              يجب توضيح مدة الاستبدال، حالة المنتج عند الاسترجاع، طريقة التواصل،
              والفرق بين عيوب الصناعة وسوء الاستخدام.
            </p>
          </div>
        </article>
      </div>
    </div>
  );
}

