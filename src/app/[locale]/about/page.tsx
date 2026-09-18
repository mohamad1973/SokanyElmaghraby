import type { Metadata } from "next";

import { VisualEditableText } from "@/components/visual-editable-text";

export const metadata: Metadata = {
  title: "عن توليانو",
  description: "نبذة عن توليانو ومنتجاتها من الأجهزة الكهربائية والمنزلية في مصر.",
};

const highlights = [
  { key: "quality", text: "الجودة العالية اللي تضمن عمر أطول." },
  { key: "technology", text: "التكنولوجيا الحديثة اللي تسهّل حياتك اليومية." },
  { key: "design", text: "التصميم العصري اللي يليق بكل بيت وكل شخصية." },
];

const services = [
  { key: "warranty", text: "ضمان رسمي معتمد على جميع منتجاتنا." },
  { key: "centers", text: "شبكة واسعة من مراكز الضمان والصيانة في مختلف المحافظات." },
  { key: "parts", text: "توفير قطع غيار أصلية وصيانة متكاملة للحفاظ على كفاءة جهازك." },
  { key: "distribution", text: "توزيع معتمد لمنتجات توليانو في كبرى المتاجر وسلاسل البيع داخل مصر." },
];

const reasons = [
  { key: "safety", text: "الأمان هو أولويتنا: كل منتجاتنا مزودة بأنظمة حماية متطورة." },
  { key: "variety", text: "تنوع في الأجهزة ما بين المنزلية والعناية الشخصية." },
  { key: "availability", text: "توافر واسع في السوق من خلال أكبر المتاجر وسلاسل البيع." },
  { key: "afterSales", text: "خدمات ما بعد البيع هدفها الأول راحة العميل ورضاه." },
];

export default function AboutPage() {
  return (
    <div className="py-12">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-[2.5rem] bg-white p-8 shadow-sm">
          <p className="text-sm font-bold text-brand-gold">
            <VisualEditableText textKey="about.eyebrow">عن توليانو</VisualEditableText>
          </p>
          <h1 className="mt-3 text-4xl font-bold text-zinc-950">
            <VisualEditableText textKey="about.title">نبذة عن توليانو</VisualEditableText>
          </h1>
          <p className="mt-5 text-lg leading-9 text-zinc-600">
            <VisualEditableText textKey="about.intro">
              على مدار أكثر من 10 سنوات، أثبتت توليانو وجودها كواحدة من أبرز العلامات التجارية في سوق
              الأجهزة الكهربائية والمنزلية وأجهزة العناية الشخصية داخل مصر. منتجاتنا أصبحت جزء أساسي من
              حياة آلاف البيوت المصرية لأنها بتجمع بين الجودة والتكنولوجيا والتصميم العصري.
            </VisualEditableText>
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {highlights.map((item) => (
              <div key={item.key} className="rounded-3xl bg-brand-cream p-5 font-bold leading-7 text-zinc-800">
                <VisualEditableText textKey={`about.highlight.${item.key}`}>{item.text}</VisualEditableText>
              </div>
            ))}
          </div>

          <p className="mt-8 text-lg leading-9 text-zinc-600">
            <VisualEditableText textKey="about.agent">
              ومن أول يوم كان هدفنا نقدّم لعملائنا الأمان والراحة في كل جهاز. بنوفّر الضمان والصيانة
              وقطع الغيار الأصلية، وكمان بنتولى توزيع منتجات توليانو لأكبر المتاجر وسلاسل البيع على
              مستوى الجمهورية.
            </VisualEditableText>
          </p>

          <h2 className="mt-10 text-2xl font-bold text-zinc-950">
            <VisualEditableText textKey="about.servicesTitle">خدمات توليانو تشمل</VisualEditableText>
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {services.map((item) => (
              <div key={item.key} className="rounded-3xl border border-black/10 bg-zinc-50 p-5 font-bold leading-7 text-zinc-800">
                <VisualEditableText textKey={`about.service.${item.key}`}>{item.text}</VisualEditableText>
              </div>
            ))}
          </div>

          <h2 className="mt-10 text-2xl font-bold text-zinc-950">
            <VisualEditableText textKey="about.whyTitle">ليه تختار توليانو؟</VisualEditableText>
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {reasons.map((item) => (
              <div key={item.key} className="rounded-3xl bg-brand-cream p-5 font-bold leading-7 text-zinc-800">
                <VisualEditableText textKey={`about.reason.${item.key}`}>{item.text}</VisualEditableText>
              </div>
            ))}
          </div>

          <h2 className="mt-10 text-2xl font-bold text-zinc-950">
            <VisualEditableText textKey="about.visionTitle">رؤيتنا</VisualEditableText>
          </h2>
          <p className="mt-5 text-lg leading-9 text-zinc-600">
            <VisualEditableText textKey="about.vision">
              رؤيتنا إننا نكون الاختيار الأول لكل بيت مصري وكل شخص بيدوّر على الأمان والجودة والابتكار.
              بنوعدكم إن منتجات توليانو تفضل دائمًا قريبة منكم وسهلة الوصول. توليانو مش مجرد منتجات،
              لكنها رحلة نجاح مبنية على الأمان والثقة… ومعاكم المستقبل أجمل.
            </VisualEditableText>
          </p>

          <p className="mt-8 rounded-3xl bg-black px-6 py-5 text-center text-lg font-bold text-brand-gold">
            <VisualEditableText textKey="about.tagline">الأمان هو شعارنا… والثقة هي وعدنا.</VisualEditableText>
          </p>
        </div>
      </div>
    </div>
  );
}
