"use client";

import { useState, type ReactNode } from "react";

import type { ProductReview } from "@/lib/types";

import { ProductSpecRow } from "./product-spec-row";
import { VisualEditableText } from "./visual-editable-text";

type TabId = "specs" | "reviews" | "shipping";

type ProductDetailTabsProps = {
  attributes: Record<string, string>;
  codeLabel: string;
  displayCode: string;
  rating: string;
  reviews: ProductReview[];
};

const TABS: Array<{ id: TabId; label: ReactNode }> = [
  {
    id: "specs",
    label: <VisualEditableText textKey="product.specifications">المواصفات</VisualEditableText>,
  },
  { id: "reviews", label: "المراجعات" },
  { id: "shipping", label: "الشحن والتوصيل" },
];

export function ProductDetailTabs({
  attributes,
  codeLabel,
  displayCode,
  rating,
  reviews,
}: ProductDetailTabsProps) {
  const [active, setActive] = useState<TabId>("specs");
  const attributeEntries = Object.entries(attributes);

  return (
    <div className="mt-8 rounded-[2rem] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap gap-2 border-b border-black/5 pb-4" role="tablist" aria-label="تفاصيل المنتج">
        {TABS.map((tab) => {
          const isActive = active === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tab.id)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                isActive
                  ? "bg-black text-brand-gold"
                  : "bg-zinc-100 text-zinc-700 hover:bg-brand-gold/20 hover:text-zinc-950"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5" role="tabpanel">
        {active === "specs" ? (
          <div className="grid gap-3">
            {attributeEntries.map(([key, value], index) => (
              <ProductSpecRow key={key} label={key} value={value} striped={index % 2 === 1} />
            ))}
            <ProductSpecRow
              label={<VisualEditableText textKey="product.skuLabel">{codeLabel}</VisualEditableText>}
              value={displayCode}
              striped={attributeEntries.length % 2 === 1}
            />
          </div>
        ) : null}

        {active === "reviews" ? (
          <div className="space-y-4">
            <p className="text-sm font-medium text-zinc-600">
              التقييم العام:{" "}
              <span className="font-bold text-zinc-950">{Number(rating) > 0 ? rating : "—"} / 5</span>
            </p>
            {reviews.length ? (
              <ul className="space-y-3">
                {reviews.map((review) => (
                  <li key={review.id} className="rounded-2xl bg-zinc-50 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold text-zinc-950">{review.reviewer}</p>
                      <p className="text-xs font-bold text-brand-gold">{review.rating} / 5</p>
                    </div>
                    {review.review ? (
                      <p className="mt-2 text-sm leading-7 text-zinc-600">{review.review}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm leading-7 text-zinc-600">لا توجد مراجعات بعد لهذا المنتج.</p>
            )}
          </div>
        ) : null}

        {active === "shipping" ? (
          <div className="space-y-3 text-sm leading-8 text-zinc-600">
            <p>
              نوصل طلبات سوكاني داخل جمهورية مصر العربية عبر شبكة التوزيع التابعة لمؤسسة المغربي، مع أولوية
              للمناطق المتاحة للتغطية اليومية.
            </p>
            <p>
              المدة التقديرية للتوصيل عادة من ٢ إلى ٥ أيام عمل حسب المدينة وتوافر المخزون، وقد تطول قليلاً في
              المناطق البعيدة أو أوقات الذروة.
            </p>
            <p>
              يتوفر الدفع عند الاستلام حيث ينطبق ذلك على منطقتك، وستتواصل معك خدمة العملاء لتأكيد العنوان
              وموعد التسليم قبل الشحن.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
