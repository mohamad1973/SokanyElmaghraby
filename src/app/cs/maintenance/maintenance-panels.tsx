"use client";

import { useState } from "react";

import { formatCairoOrderDateTime } from "@/lib/cs/order-window";

export type Grade = "first" | "second" | "scrap";

export type PanelReview = {
  destination: string;
  grade: Grade | null;
  techNote: string;
  deliveredToMaintenanceAt: string | null;
  receivedFromMaintenanceAt: string | null;
  shelfAt: string | null;
  defects: string[];
  label: string;
  usage: "new" | "used" | null;
};

export type PanelRow = {
  trackingNumber: string;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
  product: string;
  day: string;
  note: string;
  openedAt: string | null;
  statusLabel: string;
  review: PanelReview | null;
};

export type VariancePayload = {
  delivered: number;
  graded: number;
  returned: number;
  missing: Array<{
    trackingNumber: string;
    wooOrderNumber: string;
    status: string;
    grade: Grade | null;
    deliveredAt: string | null;
    receivedAt: string | null;
  }>;
};

const GRADE_OPTIONS: Array<{ id: Grade; label: string }> = [
  { id: "first", label: "فرز أول" },
  { id: "second", label: "فرز ثاني" },
  { id: "scrap", label: "هالك" },
];

const GRADE_LABEL: Record<Grade, string> = {
  first: "فرز أول",
  second: "فرز ثاني",
  scrap: "هالك",
};

const DEFECT_AR: Record<string, string> = {
  break: "كسر",
  power: "فاصل بور",
  disassembled: "مفكك",
  dented: "مخبوط",
  manufacturing: "عيب صناعة",
};

export function defectsAr(defects: string[]) {
  return defects.map((d) => DEFECT_AR[d] || d).filter(Boolean).join("، ");
}

export function NoteModal({
  trackingNumber,
  initial,
  onClose,
  onSaved,
}: {
  trackingNumber: string;
  initial: string;
  onClose: () => void;
  onSaved: (note: string) => void;
}) {
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/cs/maintenance/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "note", trackingNumber, note: text }),
      });
      const body = (await response.json()) as { message?: string; note?: string };
      if (!response.ok) {
        setError(body.message || "تعذر حفظ الملاحظة.");
        return;
      }
      onSaved(body.note || text);
      onClose();
    } catch {
      setError("تعذر حفظ الملاحظة.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4" dir="rtl">
      <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-base font-extrabold text-[#14213D]">ملاحظة المرتجع</h3>
        <p className="text-xs font-bold text-[#14213D]/60">{trackingNumber}</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="كلام العميل أو أي ملاحظة… (اختياري)"
          className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm font-bold text-[#14213D]"
        />
        {error ? <p className="text-sm font-bold text-red-700">{error}</p> : null}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="flex-1 rounded-xl bg-[#FCA311] px-3 py-2 text-sm font-extrabold text-black disabled:opacity-60"
          >
            {saving ? "جارٍ الحفظ…" : "حفظ"}
          </button>
          <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-[#14213D] px-3 py-2 text-sm font-extrabold text-white">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

export function TechPanel({
  rows,
  onChanged,
}: {
  rows: PanelRow[];
  onChanged: () => void;
}) {
  const pending = rows.filter(
    (row) =>
      row.review?.destination === "maintenance" &&
      !row.review.receivedFromMaintenanceAt,
  );
  const [busy, setBusy] = useState<string>("");
  const [draft, setDraft] = useState<Record<string, { grade: Grade | ""; techNote: string }>>({});

  function stateFor(row: PanelRow) {
    return (
      draft[row.trackingNumber] || {
        grade: (row.review?.grade || "") as Grade | "",
        techNote: row.review?.techNote || "",
      }
    );
  }

  async function saveGrade(row: PanelRow) {
    const state = stateFor(row);
    if (!state.grade) return;
    setBusy(row.trackingNumber);
    try {
      const response = await fetch("/api/cs/maintenance/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "grade",
          trackingNumber: row.trackingNumber,
          grade: state.grade,
          techNote: state.techNote,
        }),
      });
      if (response.ok) onChanged();
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-3 p-4" dir="rtl">
      <p className="text-sm font-bold text-[#14213D]/70">
        المسلم للصيانة فقط — بعد الإصلاح اختَر فرز أول أو فرز ثاني أو هالك.
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-right text-sm">
          <thead className="bg-[#F5F5F0] text-xs font-extrabold">
            <tr>
              <th className="px-2 py-2">البوليصة</th>
              <th className="px-2 py-2">الأوردر</th>
              <th className="px-2 py-2">المنتج</th>
              <th className="px-2 py-2">التسليم</th>
              <th className="px-2 py-2">التصنيف</th>
              <th className="px-2 py-2">ملاحظة فني</th>
              <th className="px-2 py-2">حفظ</th>
            </tr>
          </thead>
          <tbody>
            {pending.length ? (
              pending.map((row) => {
                const state = stateFor(row);
                return (
                  <tr key={row.trackingNumber} className="border-t border-black/5">
                    <td className="px-2 py-2 font-bold">{row.trackingNumber}</td>
                    <td className="px-2 py-2">{row.wooOrderNumber || "—"}</td>
                    <td className="px-2 py-2">{row.product || "—"}</td>
                    <td className="px-2 py-2 text-xs">
                      {formatCairoOrderDateTime(row.review?.deliveredToMaintenanceAt).absolute}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        {GRADE_OPTIONS.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            disabled={Boolean(row.review?.receivedFromMaintenanceAt)}
                            onClick={() =>
                              setDraft((cur) => ({
                                ...cur,
                                [row.trackingNumber]: { ...state, grade: item.id },
                              }))
                            }
                            className={`rounded-full px-2 py-1 text-xs font-extrabold ${
                              state.grade === item.id ? "bg-[#E6B325] text-black" : "bg-[#F5F5F0]"
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={state.techNote}
                        disabled={Boolean(row.review?.receivedFromMaintenanceAt)}
                        onChange={(e) =>
                          setDraft((cur) => ({
                            ...cur,
                            [row.trackingNumber]: { ...state, techNote: e.target.value },
                          }))
                        }
                        className="w-40 rounded-lg border border-black/10 px-2 py-1 text-xs font-bold"
                        placeholder="اختياري"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        disabled={!state.grade || busy === row.trackingNumber || Boolean(row.review?.receivedFromMaintenanceAt)}
                        onClick={() => void saveGrade(row)}
                        className="rounded-full bg-[#14213D] px-3 py-1 text-xs font-extrabold text-white disabled:opacity-40"
                      >
                        {busy === row.trackingNumber ? "…" : "حفظ"}
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center font-bold text-[#14213D]/50">
                  مفيش قطع مسلّمة للصيانة في المدى.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ReceiveAndShelfPanel({
  rows,
  onChanged,
}: {
  rows: PanelRow[];
  onChanged: () => void;
}) {
  const ready = rows.filter(
    (row) =>
      row.review?.destination === "maintenance" &&
      row.review.grade &&
      !row.review.receivedFromMaintenanceAt,
  );
  const firstReturned = rows.filter(
    (row) =>
      row.review?.destination === "maintenance" &&
      row.review.grade === "first" &&
      row.review.receivedFromMaintenanceAt &&
      !row.review.shelfAt,
  );
  const [busy, setBusy] = useState(false);

  async function receiveAll() {
    if (!ready.length) return;
    setBusy(true);
    try {
      await fetch("/api/cs/maintenance/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "receive",
          trackingNumbers: ready.map((r) => r.trackingNumber),
        }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function shelfOne(trackingNumber: string) {
    setBusy(true);
    try {
      await fetch("/api/cs/maintenance/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "shelf", trackingNumber }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 border-t border-black/10 p-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-extrabold text-[#14213D]">
          جاهز للاستلام من الصيانة: {ready.length}
        </p>
        <button
          type="button"
          disabled={!ready.length || busy}
          onClick={() => void receiveAll()}
          className="rounded-full bg-[#14213D] px-4 py-2 text-xs font-extrabold text-white disabled:opacity-40"
        >
          استلام الكل من الصيانة
        </button>
      </div>
      {firstReturned.length ? (
        <div className="space-y-2">
          <p className="text-sm font-extrabold">فرز أول — ضع على الرف</p>
          {firstReturned.map((row) => (
            <div key={row.trackingNumber} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F5F5F0] px-3 py-2">
              <span className="text-sm font-bold">
                {row.trackingNumber} · {row.product || row.wooOrderNumber}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void shelfOne(row.trackingNumber)}
                className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-extrabold text-white"
              >
                على الرف
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AccountingPanel({ rows }: { rows: PanelRow[] }) {
  const second = rows.filter(
    (row) =>
      row.review?.destination === "maintenance" &&
      row.review.grade === "second" &&
      row.review.receivedFromMaintenanceAt,
  );
  const scrap = rows.filter(
    (row) =>
      row.review?.destination === "maintenance" &&
      row.review.grade === "scrap" &&
      row.review.receivedFromMaintenanceAt,
  );

  function printBlock(kind: "second" | "scrap") {
    const list = kind === "second" ? second : scrap;
    const title =
      kind === "second"
        ? "حسابات الصيانة — فرز ثاني → أوتليت (ERP)"
        : "حسابات الصيانة — هالك → مخزن صيانة هالك (ERP)";
    const win = window.open("", "_blank");
    if (!win) return;
    const rowsHtml = list
      .map(
        (row) =>
          `<tr>
            <td>${row.day}</td>
            <td>${row.trackingNumber}</td>
            <td>${row.wooOrderNumber || ""}</td>
            <td>${row.customerName || ""}</td>
            <td>${row.product || ""}</td>
            <td>${defectsAr(row.review?.defects || [])}</td>
            <td>${row.note || ""}</td>
            <td>${row.review?.techNote || ""}</td>
            <td>${row.review?.receivedFromMaintenanceAt ? formatCairoOrderDateTime(row.review.receivedFromMaintenanceAt).absolute : ""}</td>
          </tr>`,
      )
      .join("");
    win.document.write(`<!doctype html><html dir="rtl"><head><title>${title}</title>
      <style>
        body{font-family:Tahoma,Arial,sans-serif;padding:12px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #000;padding:4px;text-align:right}
        h1{font-size:18px;text-align:center}
      </style></head><body>
      <h1>${title}</h1>
      <p style="text-align:center">عدد الصفوف: ${list.length} — للترحيل على نظام ERP المستقل</p>
      <table><thead><tr>
        <th>اليوم</th><th>البوليصة</th><th>الأوردر</th><th>العميل</th><th>المنتج</th>
        <th>العيوب</th><th>ملاحظة استلام</th><th>ملاحظة فني</th><th>استلام من الصيانة</th>
      </tr></thead><tbody>${rowsHtml || `<tr><td colspan="9">لا بيانات</td></tr>`}</tbody></table>
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <p className="text-sm font-bold text-[#14213D]/70">
        قوائم للترحيل على ERP المستقل (أوتليت وهالك) — بدون تحويل داخلي لمخزن العاشر.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => printBlock("second")}
          className="rounded-full bg-[#FCA311] px-4 py-2 text-xs font-extrabold text-black"
        >
          طباعة فرز ثاني ({second.length})
        </button>
        <button
          type="button"
          onClick={() => printBlock("scrap")}
          className="rounded-full bg-[#14213D] px-4 py-2 text-xs font-extrabold text-white"
        >
          طباعة هالك ({scrap.length})
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <h3 className="mb-2 text-sm font-extrabold">فرز ثاني — أوتليت ERP</h3>
          <ul className="space-y-1 text-sm">
            {second.map((row) => (
              <li key={row.trackingNumber} className="rounded-lg bg-[#F5F5F0] px-2 py-1 font-bold">
                {row.trackingNumber} · {row.product || row.wooOrderNumber}
              </li>
            ))}
            {!second.length ? <li className="text-[#14213D]/50">لا صفوف</li> : null}
          </ul>
        </section>
        <section>
          <h3 className="mb-2 text-sm font-extrabold">هالك — ERP</h3>
          <ul className="space-y-1 text-sm">
            {scrap.map((row) => (
              <li key={row.trackingNumber} className="rounded-lg bg-[#F5F5F0] px-2 py-1 font-bold">
                {row.trackingNumber} · {row.product || row.wooOrderNumber}
              </li>
            ))}
            {!scrap.length ? <li className="text-[#14213D]/50">لا صفوف</li> : null}
          </ul>
        </section>
      </div>
    </div>
  );
}

export function VariancePanel({ variance }: { variance: VariancePayload | null }) {
  if (!variance) return null;
  const statusAr: Record<string, string> = {
    pending_grade: "لسه متصنّفش",
    pending_return: "اتصنّف ومترجعش",
    returned: "راجع",
    ok: "تمام",
  };
  return (
    <div className="space-y-3 p-4" dir="rtl">
      <div className="flex flex-wrap gap-3 text-sm font-extrabold">
        <span className="rounded-full bg-[#F5F5F0] px-3 py-1">مسلّم: {variance.delivered}</span>
        <span className="rounded-full bg-[#F5F5F0] px-3 py-1">متصنّف: {variance.graded}</span>
        <span className="rounded-full bg-[#F5F5F0] px-3 py-1">راجع: {variance.returned}</span>
        <span className="rounded-full bg-red-50 px-3 py-1 text-red-800">فروقات: {variance.missing.length}</span>
      </div>
      <table className="min-w-full text-right text-sm">
        <thead className="bg-[#F5F5F0] text-xs font-extrabold">
          <tr>
            <th className="px-2 py-2">البوليصة</th>
            <th className="px-2 py-2">الأوردر</th>
            <th className="px-2 py-2">الحالة</th>
            <th className="px-2 py-2">التصنيف</th>
            <th className="px-2 py-2">تسليم</th>
          </tr>
        </thead>
        <tbody>
          {variance.missing.length ? (
            variance.missing.map((row) => (
              <tr key={row.trackingNumber} className="border-t border-black/5">
                <td className="px-2 py-2 font-bold">{row.trackingNumber}</td>
                <td className="px-2 py-2">{row.wooOrderNumber || "—"}</td>
                <td className="px-2 py-2">{statusAr[row.status] || row.status}</td>
                <td className="px-2 py-2">{row.grade ? GRADE_LABEL[row.grade] : "—"}</td>
                <td className="px-2 py-2 text-xs">{formatCairoOrderDateTime(row.deliveredAt).absolute}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center font-bold text-emerald-800">
                مفيش فروقات في المدى.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
