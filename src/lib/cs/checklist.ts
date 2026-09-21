export const CS_CONFIRMATION_STATUS = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  CONFIRMED: "CONFIRMED",
  FAILED_CONTACT: "FAILED_CONTACT",
} as const;

export type CsConfirmationStatus =
  (typeof CS_CONFIRMATION_STATUS)[keyof typeof CS_CONFIRMATION_STATUS];

export type CsChecklistFieldType = "confirm_text" | "confirm_only" | "yes_no_extra" | "choice";

export type CsChecklistItemDef = {
  key: string;
  label: string;
  help: string;
  type: CsChecklistFieldType;
  required: boolean;
  /** When type is yes_no_extra and answer is "yes", extra text required */
  extraRequiredWhenYes?: boolean;
  choices?: Array<{ value: string; label: string }>;
};

/** Fixed call-script items for CS confirmation (M2). */
export const CS_CHECKLIST_ITEMS: CsChecklistItemDef[] = [
  {
    key: "customer_name",
    label: "تأكيد الاسم",
    help: "أكد الاسم مع العميل وصحّحه إن لزم.",
    type: "confirm_text",
    required: true,
  },
  {
    key: "address_complete",
    label: "تأكيد العنوان كامل",
    help: "هل العنوان كامل وواضح للتوصيل؟",
    type: "confirm_text",
    required: true,
  },
  {
    key: "address_landmarks",
    label: "علامات مميزة للمكان",
    help: "سجّل علامات مميزة وأكد أن العميل أوضحها.",
    type: "confirm_text",
    required: true,
  },
  {
    key: "primary_phone",
    label: "تليفون أساسي",
    help: "أكد رقم التليفون الأساسي.",
    type: "confirm_text",
    required: true,
  },
  {
    key: "alt_phone",
    label: "تليفون بديل لشخص آخر",
    help: "إن وُجد سجّل الاسم والرقم. إن لم يوجد اختر «لا».",
    type: "yes_no_extra",
    required: true,
    extraRequiredWhenYes: true,
  },
  {
    key: "invoice_total",
    label: "قيمة الفاتورة",
    help: "أكد قيمة الفاتورة مع العميل.",
    type: "confirm_only",
    required: true,
  },
  {
    key: "order_items",
    label: "تفاصيل الأصناف والألوان والكميات",
    help: "راجع بنود الطلب مع العميل سطراً سطراً.",
    type: "confirm_only",
    required: true,
  },
  {
    key: "paid_online",
    label: "تم الدفع من الموقع؟",
    help: "أكد حالة الدفع الظاهرة على الطلب.",
    type: "confirm_only",
    required: true,
  },
  {
    key: "payment_preference",
    label: "طريقة الدفع المفضلة / عند الاستلام",
    help: "سجّل طريقة الدفع المتفق عليها.",
    type: "choice",
    required: true,
    choices: [
      { value: "cod", label: "الدفع عند الاستلام" },
      { value: "already_paid", label: "مدفوع مسبقاً على الموقع" },
      { value: "transfer", label: "تحويل بنكي / فوري لاحقاً" },
    ],
  },
  {
    key: "free_shipping",
    label: "الشحن مجاني؟",
    help: "أكد للعميل هل الشحن مجاني حسب الطلب.",
    type: "confirm_only",
    required: true,
  },
  {
    key: "delivery_terms",
    label: "إعلام بشروط الاستلام",
    help: "يجب إعلام العميل بشروط الاستلام قبل إنهاء المكالمة.",
    type: "confirm_only",
    required: true,
  },
];

export type CsChecklistAnswerInput = {
  itemKey: string;
  confirmed: boolean;
  value?: string | null;
  note?: string | null;
  /** for yes_no_extra: "yes" | "no" */
  yesNo?: "yes" | "no" | null;
};

export function validateChecklistAnswers(answers: CsChecklistAnswerInput[]) {
  const byKey = new Map(answers.map((a) => [a.itemKey, a]));
  const missing: string[] = [];

  for (const item of CS_CHECKLIST_ITEMS) {
    if (!item.required) continue;
    const answer = byKey.get(item.key);
    if (!answer) {
      missing.push(item.key);
      continue;
    }

    if (item.type === "confirm_text") {
      if (!answer.confirmed || !String(answer.value || "").trim()) {
        missing.push(item.key);
      }
      continue;
    }

    if (item.type === "confirm_only") {
      if (!answer.confirmed) missing.push(item.key);
      continue;
    }

    if (item.type === "choice") {
      if (!answer.confirmed || !String(answer.value || "").trim()) {
        missing.push(item.key);
      }
      continue;
    }

    if (item.type === "yes_no_extra") {
      const yn = answer.yesNo || (answer.value === "no" ? "no" : answer.value?.startsWith("yes") ? "yes" : null);
      if (!yn) {
        missing.push(item.key);
        continue;
      }
      if (yn === "yes" && item.extraRequiredWhenYes) {
        const extra = String(answer.note || answer.value || "").replace(/^yes:?/i, "").trim();
        if (!extra || !answer.confirmed) missing.push(item.key);
      } else if (yn === "no" && !answer.confirmed) {
        missing.push(item.key);
      }
    }
  }

  return { ok: missing.length === 0, missing };
}
