"use client";

import { useState } from "react";

import { ReturnTrackDrawer } from "@/components/cs/return-track-line";
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

export type PanelTicketBadge = {
  id: number;
  statusLabel: string;
  wooOrderNumber: string;
};

export type PanelRow = {
  trackingNumber: string;
  productId?: number | null;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
  product: string;
  day: string;
  note: string;
  openedAt: string | null;
  statusLabel: string;
  deskTicket?: PanelTicketBadge | null;
  deskTickets?: PanelTicketBadge[];
  review: PanelReview | null;
};

function panelKey(row: PanelRow) {
  return row.productId != null ? `${row.trackingNumber}:${row.productId}` : row.trackingNumber;
}

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
  onOpenTicket,
}: {
  rows: PanelRow[];
  onChanged: () => void;
  onOpenTicket?: (tickets: PanelTicketBadge[]) => void;
}) {
  // Only waiting for grade — graded items move to «عائد من الصيانة».
  const pending = rows.filter(
    (row) =>
      row.review?.destination === "maintenance" &&
      !row.review.receivedFromMaintenanceAt &&
      !row.review.grade,
  );
  const [busy, setBusy] = useState<string>("");
  const [draft, setDraft] = useState<Record<string, { grade: Grade | ""; techNote: string }>>({});

  function stateFor(row: PanelRow) {
    const key = panelKey(row);
    return (
      draft[key] || {
        grade: (row.review?.grade || "") as Grade | "",
        techNote: row.review?.techNote || "",
      }
    );
  }

  async function saveGrade(row: PanelRow) {
    const state = stateFor(row);
    if (!state.grade) return;
    const key = panelKey(row);
    setBusy(key);
    try {
      const response = await fetch("/api/cs/maintenance/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "grade",
          trackingNumber: row.trackingNumber,
          grade: state.grade,
          techNote: state.techNote,
          ...(row.productId != null ? { productId: row.productId } : {}),
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
      {pending.length ? (
        <div className="space-y-3">
          {pending.map((row) => {
            const state = stateFor(row);
            const key = panelKey(row);
            const tickets =
              row.deskTickets && row.deskTickets.length
                ? row.deskTickets
                : row.deskTicket
                  ? [row.deskTicket]
                  : [];
            return (
              <article key={key} className="w-full rounded-2xl bg-[#F5F5F0] p-3 ring-1 ring-black/5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {tickets.length ? (
                        <button
                          type="button"
                          title="فتح تكت الاستقبال"
                          onClick={() => onOpenTicket?.(tickets)}
                          className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-extrabold text-white"
                        >
                          تكت
                        </button>
                      ) : null}
                      <span className="text-sm font-extrabold text-[#14213D]">
                        #{row.wooOrderNumber || "—"}
                      </span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold text-[#14213D] ring-1 ring-black/10">
                        {row.statusLabel || "—"}
                      </span>
                    </div>
                    <p className="text-sm font-extrabold text-[#14213D]">{row.customerName || "—"}</p>
                    <p className="break-words text-xs font-bold text-[#14213D]/80">
                      {row.product || "—"}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#14213D]/70">
                      <span dir="ltr">{row.trackingNumber}</span>
                      <ReturnTrackDrawer trackingNumber={row.trackingNumber} />
                      <span>
                        استلام: {formatCairoOrderDateTime(row.review?.deliveredToMaintenanceAt).absolute}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {GRADE_OPTIONS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      disabled={Boolean(row.review?.receivedFromMaintenanceAt)}
                      onClick={() =>
                        setDraft((cur) => ({
                          ...cur,
                          [key]: { ...state, grade: item.id },
                        }))
                      }
                      className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${
                        state.grade === item.id ? "bg-[#E6B325] text-black" : "bg-white text-[#14213D] ring-1 ring-black/10"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    value={state.techNote}
                    disabled={Boolean(row.review?.receivedFromMaintenanceAt)}
                    onChange={(e) =>
                      setDraft((cur) => ({
                        ...cur,
                        [key]: { ...state, techNote: e.target.value },
                      }))
                    }
                    className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs font-bold"
                    placeholder="ملاحظة فني (اختياري)"
                  />
                  <button
                    type="button"
                    disabled={!state.grade || busy === key || Boolean(row.review?.receivedFromMaintenanceAt)}
                    onClick={() => void saveGrade(row)}
                    className="shrink-0 rounded-full bg-[#14213D] px-4 py-1.5 text-xs font-extrabold text-white disabled:opacity-40"
                  >
                    {busy === key ? "…" : "حفظ"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="rounded-2xl bg-[#F5F5F0] px-3 py-6 text-center text-sm font-bold text-[#14213D]/50">
          مفيش قطع مسلّمة للصيانة في المدى.
        </p>
      )}
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
  const recentlyReceived = rows
    .filter(
      (row) =>
        row.review?.destination === "maintenance" &&
        row.review.grade &&
        row.review.receivedFromMaintenanceAt,
    )
    .sort((a, b) =>
      String(b.review?.receivedFromMaintenanceAt || "").localeCompare(
        String(a.review?.receivedFromMaintenanceAt || ""),
      ),
    );
  const [busy, setBusy] = useState(false);
  const [busyTrack, setBusyTrack] = useState("");

  async function receiveAll() {
    if (!ready.length) return;
    setBusy(true);
    try {
      await fetch("/api/cs/maintenance/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "receive",
          items: ready.map((r) => ({
            trackingNumber: r.trackingNumber,
            productId: r.productId ?? null,
          })),
        }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function receiveOne(row: PanelRow) {
    const key = panelKey(row);
    setBusyTrack(key);
    try {
      await fetch("/api/cs/maintenance/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "receive",
          items: [{ trackingNumber: row.trackingNumber, productId: row.productId ?? null }],
        }),
      });
      onChanged();
    } finally {
      setBusyTrack("");
    }
  }

  async function shelfOne(row: PanelRow) {
    setBusy(true);
    try {
      await fetch("/api/cs/maintenance/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "shelf",
          trackingNumber: row.trackingNumber,
          ...(row.productId != null ? { productId: row.productId } : {}),
        }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 border-t border-black/10 p-4" dir="rtl">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-base font-extrabold text-[#14213D]">عائد من الصيانة — بانتظار الاستلام</p>
            <p className="text-xs font-bold text-[#14213D]/60">
              مصنَّف فرز أول / أوتليت / هالك ولسه ما استلمتوش من الفني: {ready.length}
            </p>
          </div>
          <button
            type="button"
            disabled={!ready.length || busy}
            onClick={() => void receiveAll()}
            className="rounded-full bg-[#14213D] px-4 py-2 text-xs font-extrabold text-white disabled:opacity-40"
          >
            استلام الكل
          </button>
        </div>
        {ready.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-right text-sm">
              <thead className="bg-[#F5F5F0] text-xs font-extrabold">
                <tr>
                  <th className="px-2 py-2">البوليصة</th>
                  <th className="px-2 py-2">المسار</th>
                  <th className="px-2 py-2">الأوردر</th>
                  <th className="px-2 py-2">المنتج</th>
                  <th className="px-2 py-2">التصنيف</th>
                  <th className="px-2 py-2">ملاحظة فني</th>
                  <th className="px-2 py-2">استلام</th>
                </tr>
              </thead>
              <tbody>
                {ready.map((row) => {
                  const key = panelKey(row);
                  return (
                    <tr key={key} className="border-t border-black/5">
                      <td className="px-2 py-2 font-bold" dir="ltr">
                        {row.trackingNumber}
                      </td>
                      <td className="px-2 py-2">
                        <ReturnTrackDrawer trackingNumber={row.trackingNumber} />
                      </td>
                      <td className="px-2 py-2">{row.wooOrderNumber || "—"}</td>
                      <td className="px-2 py-2">{row.product || "—"}</td>
                      <td className="px-2 py-2 font-extrabold">
                        {row.review?.grade ? GRADE_LABEL[row.review.grade] : "—"}
                      </td>
                      <td className="px-2 py-2 text-xs">{row.review?.techNote || "—"}</td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          disabled={busy || busyTrack === key}
                          onClick={() => void receiveOne(row)}
                          className="rounded-full bg-[#E6B325] px-3 py-1 text-xs font-extrabold text-black disabled:opacity-40"
                        >
                          {busyTrack === key ? "…" : "استلام"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-xl bg-[#F5F5F0] px-3 py-4 text-center text-sm font-bold text-[#14213D]/50">
            مفيش مرتجعات مصنَّفة بانتظار الاستلام.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-extrabold text-[#14213D]">فرز أول — ضع على الرف ({firstReturned.length})</p>
        {firstReturned.length ? (
          firstReturned.map((row) => (
            <div
              key={panelKey(row)}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F5F5F0] px-3 py-2"
            >
              <span className="text-sm font-bold">
                {row.trackingNumber} · {row.product || row.wooOrderNumber}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void shelfOne(row)}
                className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-extrabold text-white"
              >
                على الرف
              </button>
            </div>
          ))
        ) : (
          <p className="text-xs font-bold text-[#14213D]/50">مفيش فرز أول جاهز للرف.</p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-extrabold text-[#14213D]">تم الاستلام من الصيانة ({recentlyReceived.length})</p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-right text-sm">
            <thead className="bg-[#F5F5F0] text-xs font-extrabold">
              <tr>
                <th className="px-2 py-2">البوليصة</th>
                <th className="px-2 py-2">التصنيف</th>
                <th className="px-2 py-2">وقت الاستلام</th>
                <th className="px-2 py-2">الوجهة التالية</th>
              </tr>
            </thead>
            <tbody>
              {recentlyReceived.length ? (
                recentlyReceived.map((row) => {
                  const grade = row.review?.grade;
                  const next =
                    grade === "first"
                      ? row.review?.shelfAt
                        ? "على الرف"
                        : "بانتظار الرف"
                      : grade === "second"
                        ? "أوتليت / حسابات"
                        : grade === "scrap"
                          ? "هالك / حسابات"
                          : "—";
                  return (
                    <tr key={`recv-${panelKey(row)}`} className="border-t border-black/5">
                      <td className="px-2 py-2 font-bold" dir="ltr">
                        {row.trackingNumber}
                        {row.product ? (
                          <span className="mt-0.5 block text-[11px] font-bold text-[#14213D]/60">{row.product}</span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2">{grade ? GRADE_LABEL[grade] : "—"}</td>
                      <td className="px-2 py-2 text-xs">
                        {row.review?.receivedFromMaintenanceAt
                          ? formatCairoOrderDateTime(row.review.receivedFromMaintenanceAt).absolute
                          : "—"}
                      </td>
                      <td className="px-2 py-2 text-xs font-bold">{next}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center font-bold text-[#14213D]/50">
                    لسه مفيش استلامات في المدى.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
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

type TechReportApiRow = {
  trackingNumber: string;
  wooOrderNumber: string;
  productName: string;
  customerName: string;
  statusLabel: string;
  hasTicket: boolean;
  receivedAt: string | null;
  gradedAt: string | null;
  first: boolean;
  second: boolean;
  scrap: boolean;
};

export function TechReportPanel({ from, to }: { from: string; to: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reportFrom, setReportFrom] = useState(from);
  const [reportTo, setReportTo] = useState(to);
  const [summary, setSummary] = useState({
    receivedCount: 0,
    repairedCount: 0,
    firstCount: 0,
    secondCount: 0,
    scrapCount: 0,
  });
  const [rows, setRows] = useState<TechReportApiRow[]>([]);

  async function loadReport(event?: { preventDefault(): void }) {
    event?.preventDefault();
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ from: reportFrom, to: reportTo });
      const res = await fetch(`/api/cs/maintenance/tech-report?${qs}`);
      const data = (await res.json()) as {
        message?: string;
        summary?: typeof summary;
        rows?: TechReportApiRow[];
        from?: string;
        to?: string;
      };
      if (!res.ok) {
        setError(data.message || "تعذر تحميل التقرير.");
        return;
      }
      if (data.from) setReportFrom(data.from);
      if (data.to) setReportTo(data.to);
      setSummary(
        data.summary || {
          receivedCount: 0,
          repairedCount: 0,
          firstCount: 0,
          secondCount: 0,
          scrapCount: 0,
        },
      );
      setRows(data.rows || []);
    } catch {
      setError("تعذر تحميل التقرير.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <form onSubmit={(e) => void loadReport(e)} className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-extrabold text-[#14213D]">
            من
            <input
              type="date"
              value={reportFrom}
              onChange={(e) => setReportFrom(e.target.value)}
              className="mt-1 block rounded-xl border border-black/10 px-3 py-2 text-sm font-bold"
            />
          </label>
          <label className="text-xs font-extrabold text-[#14213D]">
            إلى
            <input
              type="date"
              value={reportTo}
              onChange={(e) => setReportTo(e.target.value)}
              className="mt-1 block rounded-xl border border-black/10 px-3 py-2 text-sm font-bold"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-[#E6B325] px-4 py-2 text-sm font-extrabold text-black disabled:opacity-60"
          >
            {loading ? "جاري التحميل…" : "عرض التقرير"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-full bg-[#14213D] px-4 py-2 text-sm font-extrabold text-white"
        >
          طباعة التقرير
        </button>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700 print:hidden">{error}</p> : null}
      <div className="tech-report-print space-y-3">
        <div className="space-y-2">
          <h2 className="text-lg font-extrabold text-[#14213D]">تقرير فني الصيانة</h2>
          <p className="text-sm font-bold text-[#14213D]/70" dir="ltr">
            {reportFrom} → {reportTo}
          </p>
          <div className="flex flex-wrap gap-2 text-sm font-extrabold">
            <span className="rounded-full bg-[#F5F5F0] px-3 py-1">استلم: {summary.receivedCount}</span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-900">
              تم إصلاح/فرز: {summary.repairedCount}
            </span>
            <span className="rounded-full bg-[#F5F5F0] px-3 py-1">فرز أول: {summary.firstCount}</span>
            <span className="rounded-full bg-[#F5F5F0] px-3 py-1">فرز ثاني: {summary.secondCount}</span>
            <span className="rounded-full bg-red-50 px-3 py-1 text-red-800">هالك: {summary.scrapCount}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full border-collapse text-right text-sm">
            <thead className="bg-[#F5F5F0] text-xs font-extrabold">
              <tr>
                <th className="border border-black/20 px-2 py-2">الأوردر</th>
                <th className="border border-black/20 px-2 py-2">العميل</th>
                <th className="border border-black/20 px-2 py-2">الطبيعة</th>
                <th className="border border-black/20 px-2 py-2">البوليصة / الصنف</th>
                <th className="border border-black/20 px-2 py-2">تاريخ الاستلام</th>
                <th className="border border-black/20 px-2 py-2">فرز أول</th>
                <th className="border border-black/20 px-2 py-2">فرز ثاني</th>
                <th className="border border-black/20 px-2 py-2">هالك</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row) => (
                  <tr key={`${row.trackingNumber}-${row.productName}`}>
                    <td className="border border-black/20 px-2 py-2 font-extrabold">
                      <span className="inline-flex flex-wrap items-center gap-1">
                        {row.hasTicket ? (
                          <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                            تكت
                          </span>
                        ) : null}
                        <span>#{row.wooOrderNumber}</span>
                      </span>
                    </td>
                    <td className="border border-black/20 px-2 py-2 font-bold">{row.customerName || "—"}</td>
                    <td className="border border-black/20 px-2 py-2">{row.statusLabel || "—"}</td>
                    <td className="border border-black/20 px-2 py-2">
                      <div className="font-bold" dir="ltr">
                        {row.trackingNumber}
                      </div>
                      {row.productName ? <div className="text-xs text-[#14213D]/70">{row.productName}</div> : null}
                    </td>
                    <td className="border border-black/20 px-2 py-2 text-xs">
                      {row.receivedAt ? formatCairoOrderDateTime(row.receivedAt).absolute : "—"}
                    </td>
                    <td className="border border-black/20 px-2 py-2 text-center font-extrabold">{row.first ? "✓" : ""}</td>
                    <td className="border border-black/20 px-2 py-2 text-center font-extrabold">{row.second ? "✓" : ""}</td>
                    <td className="border border-black/20 px-2 py-2 text-center font-extrabold">{row.scrap ? "✓" : ""}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="border border-black/20 px-3 py-8 text-center font-bold text-[#14213D]/60">
                    {loading ? "جاري التحميل…" : "اضغط «عرض التقرير» أو مفيش أوردرات في الفترة."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
