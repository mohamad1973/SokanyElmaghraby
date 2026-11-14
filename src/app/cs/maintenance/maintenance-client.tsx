"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { OrderSalahiaChip } from "@/components/cs/order-salahia";
import { ReturnTrackDrawer, ReturnTrackLine } from "@/components/cs/return-track-line";
import { customReturnProductId } from "@/lib/cs/custom-return-product-id";
import { formatCairoOrderDateTime } from "@/lib/cs/order-window";

import {
  AccountingPanel,
  NoteModal,
  ReceiveAndShelfPanel,
  TechPanel,
  TechReportPanel,
  VariancePanel,
  defectsAr,
  type PanelRow,
  type VariancePayload,
} from "./maintenance-panels";

type Kind = "refused" | "return" | "exchange";
type TabId = "bosta" | "temima" | "eid" | "momen";
type HubTab = "inspect" | "tech" | "receive" | "accounting" | "variance" | "tech_report";
type Condition = "sound" | "broken" | "defective";
type Defect = "break" | "power" | "disassembled" | "dented" | "manufacturing";
type Usage = "new" | "used";
type Grade = "first" | "second" | "scrap";
type Destination = "online_warehouse" | "shelf" | "maintenance" | "to_customer";
type Phase = "choose" | "defects" | "usage" | "hand" | "claim" | "saved";
type UsageFilter = "all" | "new" | "used" | "unset";
type DestinationFilter = "all" | Destination | "unreviewed";

type Review = {
  condition: Condition;
  defects: Defect[];
  destination: Destination;
  bostaClaim: boolean;
  usage: Usage | null;
  label: string;
  grade: Grade | null;
  techNote: string;
  deliveredToMaintenanceAt: string | null;
  receivedFromMaintenanceAt: string | null;
  shelfAt: string | null;
};

type LinkedProduct = {
  productId: number;
  productName: string;
  productCode: string;
  condition?: Condition | null;
  defects?: Defect[];
  destination?: Destination | null;
  usage?: Usage | null;
  bostaClaim?: boolean;
  grade?: Grade | null;
  techNote?: string;
  inspectedAt?: string | null;
  gradedAt?: string | null;
  deliveredToMaintenanceAt?: string | null;
  receivedFromMaintenanceAt?: string | null;
  shelfAt?: string | null;
  outletAt?: string | null;
  scrapAt?: string | null;
  label?: string;
};

const DEST_BADGE: Record<Destination, string> = {
  online_warehouse: "أونلاين",
  shelf: "رف",
  maintenance: "صيانة",
  to_customer: "عميل",
};

function productReviewOf(product: LinkedProduct): Review | null {
  if (!product.condition || !product.destination) return null;
  return {
    condition: product.condition,
    defects: product.defects || [],
    destination: product.destination,
    bostaClaim: Boolean(product.bostaClaim),
    usage: product.usage || null,
    label: product.label || DEST_BADGE[product.destination],
    grade: product.grade || null,
    techNote: product.techNote || "",
    deliveredToMaintenanceAt: product.deliveredToMaintenanceAt || null,
    receivedFromMaintenanceAt: product.receivedFromMaintenanceAt || null,
    shelfAt: product.shelfAt || null,
  };
}

function provisionalFromOrderItem(item: OrderItem): LinkedProduct {
  const productName = item.name.trim();
  return {
    productId: customReturnProductId(productName),
    productName,
    productCode: String(item.sku || "").trim(),
    condition: null,
    defects: [],
    destination: null,
    usage: null,
    bostaClaim: false,
    grade: null,
    techNote: "",
    label: "",
  };
}

/** Linked products plus unmatched order-snapshot lines (for picker without +). */
function inspectCandidates(row: BostaRow): LinkedProduct[] {
  const linked = row.linkedProducts || [];
  const linkedNames = new Set(linked.map((product) => product.productName.trim().toLowerCase()));
  const fromOrder = (row.orderItems || [])
    .map((item) => provisionalFromOrderItem(item))
    .filter((product) => product.productName && !linkedNames.has(product.productName.trim().toLowerCase()));
  return [...linked, ...fromOrder];
}

function rowNeedsReview(row: BostaRow) {
  const candidates = inspectCandidates(row);
  if (candidates.length) {
    return candidates.some((product) => !product.condition || !product.destination);
  }
  return !row.review;
}

function rowMatchesDestination(row: BostaRow, destination: Destination) {
  const candidates = inspectCandidates(row);
  if (candidates.length) {
    return candidates.some((product) => product.destination === destination);
  }
  return row.review?.destination === destination;
}

type Source = "bosta" | "temima" | "eid" | "momen";

type DeskTicketBadge = {
  id: number;
  statusLabel: string;
  wooOrderNumber: string;
};

type Photo = { id: number; kind: string; url: string };

type DeskTicketDetail = {
  id: number;
  productName: string;
  productCode: string;
  statusLabel: string;
  wooOrderNumber: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  centerName: string;
  usageKind: string;
  visualKind: string;
  powerCut: boolean;
  defects: string[];
  defectOther: string;
  complaintNote: string;
  customerRequest: string;
  staffProposal: string;
  managementNote: string;
  techSpecs: string;
  techNotes: string;
  inWarranty: boolean | null;
  partAvailable: boolean | null;
  chargeType: string;
  cost: number | null;
  durationText: string;
  refundKind: string;
  refundReason: string;
  hqDecision: string;
  hqNote: string;
  invoicePhotos: Photo[];
  productPhotos: Photo[];
  complaintPhotos?: Photo[];
};

type OrderItem = {
  name: string;
  sku?: string;
  quantity?: number;
};

type BostaRow = {
  trackingNumber: string;
  confirmationId: number | null;
  day: string;
  wooOrderNumber: string;
  customerName: string;
  phone: string;
  product: string;
  searchText: string;
  kind: Kind;
  statusLabel: string;
  reasonText: string;
  note: string;
  openedAt: string | null;
  review: Review | null;
  orderProduct: string;
  orderItems?: OrderItem[];
  linkedProducts: LinkedProduct[];
  source?: Source;
  deskTicket?: DeskTicketBadge | null;
  deskTickets?: DeskTicketBadge[];
};

type CourierSection = {
  found: boolean;
  rows: BostaRow[];
  error?: string | null;
};

type Payload = {
  from: string;
  to: string;
  bosta: { rows: BostaRow[]; error: string | null };
  temima: { rows: BostaRow[]; error?: string | null };
  eid: CourierSection;
  momen: CourierSection;
  variance?: VariancePayload | null;
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "bosta", label: "بوسطة" },
  { id: "temima", label: "تميمة" },
  { id: "eid", label: "عيد" },
  { id: "momen", label: "مؤمن" },
];

const KINDS: Array<{ id: Kind; label: string }> = [
  { id: "refused", label: "رفض استلام" },
  { id: "exchange", label: "استبدال" },
  { id: "return", label: "استرجاع" },
];

const DEFECTS: Array<{ id: Defect; label: string }> = [
  { id: "break", label: "كسر" },
  { id: "power", label: "فاصل بور" },
  { id: "disassembled", label: "مفكك" },
  { id: "dented", label: "مخبوط" },
  { id: "manufacturing", label: "عيب صناعة" },
];

const KIND_RANK: Record<Kind, number> = { refused: 0, exchange: 1, return: 2 };

const USAGE_OPTIONS: Array<{ id: Usage; label: string }> = [
  { id: "new", label: "جديد" },
  { id: "used", label: "مستخدم" },
];

const DEST_FILTERS: Array<{ id: DestinationFilter; label: string }> = [
  { id: "all", label: "كل الوجهات" },
  { id: "online_warehouse", label: "مخزن أونلاين" },
  { id: "shelf", label: "الرف" },
  { id: "maintenance", label: "صيانة" },
  { id: "to_customer", label: "يعود إلى العميل" },
  { id: "unreviewed", label: "لسه متفحصش" },
];

const USAGE_FILTERS: Array<{ id: UsageFilter; label: string }> = [
  { id: "all", label: "كل الاستخدام" },
  { id: "new", label: "جديد" },
  { id: "used", label: "مستخدم" },
  { id: "unset", label: "لسه متحددش" },
];

const DEST_PRINT_ORDER: Array<{ id: Destination | "unreviewed"; label: string }> = [
  { id: "online_warehouse", label: "مخزن أونلاين" },
  { id: "shelf", label: "الرف" },
  { id: "maintenance", label: "صيانة" },
  { id: "to_customer", label: "يعود إلى العميل" },
  { id: "unreviewed", label: "لسه متفحصش" },
];

const TAB_PRINT: Record<TabId, string> = {
  bosta: "مرتجعات بوسطة",
  temima: "مرتجعات تميمة",
  eid: "مرتجعات عيد",
  momen: "مرتجعات مؤمن",
};

const EMPTY_INSPECT: Record<TabId, string> = {
  bosta: "مفيش مرتجعات في المدى ده. وسّع من/إلى (إمبارح موجود لو التاريخ يشمله) أو اضغط «حفظ ظاهر بوسطة».",
  temima: "مفيش مرتجعات تميمة في المدى.",
  eid: "مفيش مرتجعات عيد في المدى.",
  momen: "مفيش مرتجعات مؤمن في المدى.",
};

function matchesQuery(searchText: string, raw: string) {
  const query = raw.trim().toLowerCase();
  if (!query) return true;
  const hay = searchText.toLowerCase();
  if (hay.includes(query)) return true;
  const digits = query.replace(/\D/g, "");
  return digits.length >= 4 && hay.replace(/\D/g, "").includes(digits);
}

function productText(product: LinkedProduct) {
  return [product.productName, product.productCode].filter(Boolean).join(" · ");
}

const SC_DEFECT_AR: Record<string, string> = {
  chop: "لا يفرم",
  grind: "لا يطحن",
  suction: "لا يشفط",
  heat: "لا يسخن",
};

function DeskTicketModal({
  tickets,
  onClose,
}: {
  tickets: DeskTicketBadge[];
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState(tickets[0]?.id || 0);
  const [ticket, setTicket] = useState<DeskTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void fetch(`/api/cs/maintenance/returns?ticketId=${selectedId}`)
      .then(async (response) => {
        const body = (await response.json()) as { message?: string; ticket?: DeskTicketDetail };
        if (cancelled) return;
        if (!response.ok || !body.ticket) {
          setTicket(null);
          setError(body.message || "تعذر فتح التكت.");
          return;
        }
        setTicket(body.ticket);
      })
      .catch(() => {
        if (!cancelled) {
          setTicket(null);
          setError("تعذر فتح التكت.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const photos = ticket
    ? [...ticket.invoicePhotos, ...ticket.productPhotos, ...(ticket.complaintPhotos || [])]
    : [];

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-4 sm:items-center" dir="rtl">
      <div className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-3xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-extrabold text-[#14213D]">تكت الاستقبال</h3>
          <button type="button" onClick={onClose} className="rounded-full bg-[#F5F5F0] px-3 py-1 text-sm font-extrabold">
            إغلاق
          </button>
        </div>
        {tickets.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {tickets.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`rounded-full px-3 py-1 text-xs font-extrabold ${
                  selectedId === item.id ? "bg-red-600 text-white" : "bg-[#F5F5F0] text-[#14213D]"
                }`}
              >
                تكت {item.id}
                {item.wooOrderNumber ? ` · #${item.wooOrderNumber}` : ""}
              </button>
            ))}
          </div>
        ) : null}
        {loading ? <p className="text-sm font-bold text-[#14213D]/60">جارٍ فتح التكت…</p> : null}
        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
        {ticket ? (
          <div className="space-y-2 text-sm font-bold text-[#14213D]">
            <h4 className="text-lg font-extrabold">
              {ticket.productName || "منتج"} · {ticket.statusLabel}
            </h4>
            <p className="text-xs text-[#14213D]/70">
              {ticket.centerName || "مركز"} · {ticket.customerName} · <span dir="ltr">{ticket.customerPhone}</span>
            </p>
            {ticket.customerAddress ? <p className="text-xs text-[#14213D]/70">{ticket.customerAddress}</p> : null}
            {ticket.wooOrderNumber ? <p className="text-xs text-[#14213D]/70">أوردر مربوط #{ticket.wooOrderNumber}</p> : null}
            <p className="text-xs text-[#14213D]/70">
              {ticket.usageKind === "new" ? "جديد" : ticket.usageKind === "used" ? "مستخدم" : "بدون معاينة"}
              {ticket.visualKind === "broken" ? " · به كسر" : ticket.visualKind === "intact" ? " · سليم ظاهريًا" : ""}
              {ticket.powerCut ? " · فاصل باور" : ""}
              {ticket.defects.map((id) => ` · ${SC_DEFECT_AR[id] || id}`).join("")}
              {ticket.defectOther ? ` · ${ticket.defectOther}` : ""}
            </p>
            {ticket.complaintNote ? (
              <p className="whitespace-pre-wrap rounded-2xl bg-red-50 px-3 py-3 text-[#7F1D1D]">
                شكوى العميل: {ticket.complaintNote}
              </p>
            ) : (
              <p className="text-[#14213D]/60">مفيش نص شكوى مكتوب على التكت.</p>
            )}
            {ticket.customerRequest ? (
              <p className="whitespace-pre-wrap rounded-2xl bg-[#F5F5F0] px-3 py-3">طلب العميل: {ticket.customerRequest}</p>
            ) : null}
            {ticket.staffProposal ? (
              <p className="whitespace-pre-wrap rounded-2xl bg-[#FFF8E7] px-3 py-3">
                قرار موظف الاستقبال: {ticket.staffProposal}
              </p>
            ) : null}
            {ticket.managementNote ? <p>قرار الإدارة: {ticket.managementNote}</p> : null}
            {ticket.refundKind ? (
              <p>
                طلب {ticket.refundKind === "exchange" ? "استبدال" : "استرجاع"}: {ticket.refundReason}
                {ticket.hqDecision ? ` · قرار: ${ticket.hqDecision === "approved" ? "موافقة" : "رفض"} ${ticket.hqNote}` : ""}
              </p>
            ) : null}
            {ticket.techSpecs ? (
              <p>
                التقييم: {ticket.techSpecs} · {ticket.inWarranty ? "في الضمان" : "خارج الضمان"} ·{" "}
                {ticket.partAvailable ? "القطعة متوفرة" : "القطعة غير متوفرة"} ·{" "}
                {ticket.chargeType === "warranty_free" ? "مجاني" : `${ticket.cost ?? 0} ج.م`} · {ticket.durationText}
              </p>
            ) : null}
            {ticket.techNotes ? <p>ملاحظات الفني: {ticket.techNotes}</p> : null}
            {photos.length ? (
              <div className="flex flex-wrap gap-2">
                {photos.map((photo) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={photo.id} src={photo.url} alt="" className="h-20 w-20 rounded-lg object-cover" />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function productsLabel(products: LinkedProduct[], orderProduct: string) {
  if (products.length) {
    return products
      .map((product) => {
        const base = productText(product);
        const badge = product.destination ? DEST_BADGE[product.destination] : "";
        return badge ? `${base} (${badge})` : base;
      })
      .join("، ");
  }
  return orderProduct || "";
}

function ProductSearch({
  row,
  onClose,
  onSaved,
}: {
  row: BostaRow;
  onClose: () => void;
  onSaved: (product: LinkedProduct) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Array<{ id: number; name: string; displayCode: string; sku: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [savingId, setSavingId] = useState(0);
  const [savingCustom, setSavingCustom] = useState(false);
  const [error, setError] = useState("");
  const customText = query.trim();
  const canSaveCustom = customText.length >= 2;

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      setSearching(true);
      setError("");
      void fetch(`/api/products/search?q=${encodeURIComponent(term)}`, { cache: "no-store" })
        .then(async (response) => {
          const body = (await response.json()) as { products?: Array<{ id: number; name: string; displayCode: string; sku: string }> };
          setHits(Array.isArray(body.products) ? body.products : []);
        })
        .catch(() => setError("تعذر البحث عن المنتج."))
        .finally(() => setSearching(false));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function choose(hit: { id: number; name: string; displayCode: string; sku: string }) {
    setSavingId(hit.id);
    setError("");
    try {
      const response = await fetch("/api/cs/maintenance/returns/product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackingNumber: row.trackingNumber,
          productId: hit.id,
          productName: hit.name,
          productCode: hit.displayCode || hit.sku,
        }),
      });
      const body = (await response.json()) as { message?: string; product?: LinkedProduct };
      if (!response.ok || !body.product) {
        setError(body.message || "تعذر ربط المنتج.");
        return;
      }
      onSaved(body.product);
      onClose();
    } catch {
      setError("تعذر ربط المنتج.");
    } finally {
      setSavingId(0);
    }
  }

  async function saveCustom() {
    if (!canSaveCustom) return;
    setSavingCustom(true);
    setError("");
    try {
      const response = await fetch("/api/cs/maintenance/returns/product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackingNumber: row.trackingNumber,
          productName: customText,
          productCode: "",
          custom: true,
        }),
      });
      const body = (await response.json()) as { message?: string; product?: LinkedProduct };
      if (!response.ok || !body.product) {
        setError(body.message || "تعذر حفظ المنتج المكتوب.");
        return;
      }
      onSaved(body.product);
      onClose();
    } catch {
      setError("تعذر حفظ المنتج المكتوب.");
    } finally {
      setSavingCustom(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" dir="rtl">
      <div className="w-full max-w-lg space-y-3 rounded-3xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold text-[#14213D]/60">المنتج المستلم</p>
            <h2 className="text-lg font-extrabold text-[#14213D]">{row.wooOrderNumber || row.trackingNumber}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-[#F5F5F0] px-3 py-1 text-sm font-extrabold">
            إغلاق
          </button>
        </div>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="اسم المنتج أو رقم الموديل"
          className="w-full rounded-2xl border border-black/10 px-3 py-3 text-sm font-bold"
          onKeyDown={(event) => {
            if (event.key === "Enter" && canSaveCustom && !hits.length) {
              event.preventDefault();
              void saveCustom();
            }
          }}
        />
        {canSaveCustom ? (
          <button
            type="button"
            disabled={savingCustom || savingId > 0}
            onClick={() => void saveCustom()}
            className="w-full rounded-2xl bg-[#14213D] px-3 py-3 text-sm font-extrabold text-white disabled:opacity-60"
          >
            {savingCustom ? "جارٍ الحفظ…" : `حفظ «${customText.slice(0, 48)}${customText.length > 48 ? "…" : ""}» كمنتج مكتوب`}
          </button>
        ) : null}
        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {searching ? <p className="text-sm font-bold text-[#14213D]/60">جارٍ البحث…</p> : null}
          {!searching && query.trim().length >= 2 && !hits.length ? (
            <p className="text-sm font-bold text-[#14213D]/60">
              مفيش منتج بالموقع بالاسم ده — تقدر تحفظ النص المكتوب بالزر فوق.
            </p>
          ) : null}
          {hits.map((hit) => (
            <button
              key={hit.id}
              type="button"
              disabled={savingId === hit.id || savingCustom}
              onClick={() => void choose(hit)}
              className="block w-full rounded-2xl bg-[#F5F5F0] px-3 py-3 text-right disabled:opacity-60"
            >
              <span className="block text-sm font-extrabold text-[#14213D]">{hit.name}</span>
              <span className="block text-xs font-bold text-[#14213D]/60">{hit.displayCode || hit.sku}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReviewCards({
  row,
  deskReturn,
  product,
  onClose,
  onBack,
  onSaved,
}: {
  row: BostaRow;
  deskReturn?: boolean;
  product?: LinkedProduct | null;
  onClose: () => void;
  onBack?: () => void;
  onSaved: (review: Review, product?: LinkedProduct | null) => void;
}) {
  const initialReview = product ? productReviewOf(product) : row.review;
  const [phase, setPhase] = useState<Phase>(initialReview ? "saved" : "choose");
  const [condition, setCondition] = useState<Condition | "">(initialReview?.condition || "");
  const [defects, setDefects] = useState<Defect[]>(initialReview?.defects || []);
  const [usage, setUsage] = useState<Usage | "">(initialReview?.usage || "");
  const [savedReview, setSavedReview] = useState<Review | null>(initialReview);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const refused = row.kind === "refused";
  const productTitle = product ? productText(product) : row.product || "—";

  function choose(next: Condition) {
    setError("");
    setCondition(next);
    setDefects([]);
    setPhase(next === "defective" ? "defects" : "usage");
  }

  function toggleDefect(defect: Defect) {
    setDefects((current) => (current.includes(defect) ? current.filter((item) => item !== defect) : [...current, defect]));
  }

  async function ensureLinkedProduct(target: LinkedProduct) {
    const already = (row.linkedProducts || []).find((item) => item.productId === target.productId);
    if (already) return already;
    const response = await fetch("/api/cs/maintenance/returns/product", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trackingNumber: row.trackingNumber,
        productName: target.productName,
        productCode: target.productCode || "",
        custom: true,
      }),
    });
    const body = (await response.json()) as { message?: string; product?: LinkedProduct };
    if (!response.ok || !body.product) {
      throw new Error(body.message || "تعذر ربط الصنف بالمرتجع.");
    }
    return body.product;
  }

  async function finish(destinationOverride?: "shelf" | "maintenance" | "to_customer") {
    if (!condition) return;
    if (usage !== "new" && usage !== "used") {
      setError("حدّد المنتج جديد أو مستخدم.");
      setPhase("usage");
      return;
    }
    setSaving(true);
    setError("");
    try {
      let productId = product?.productId ?? null;
      let linkedProduct: LinkedProduct | null = product || null;
      if (product) {
        linkedProduct = await ensureLinkedProduct(product);
        productId = linkedProduct.productId;
      }
      const response = await fetch("/api/cs/maintenance/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackingNumber: row.trackingNumber,
          condition,
          defects,
          usage,
          ...(destinationOverride ? { destination: destinationOverride } : {}),
          ...(productId != null ? { productId } : {}),
        }),
      });
      const body = (await response.json()) as {
        message?: string;
        review?: Review;
        product?: LinkedProduct;
        detail?: string;
      };
      if (!response.ok || !body.review) {
        const base = body.message || "تعذر حفظ الفحص.";
        setError(body.detail ? `${base} (${body.detail})` : base);
        return;
      }
      const savedProduct = body.product || linkedProduct;
      onSaved(body.review, savedProduct);
      setSavedReview(
        savedProduct && product ? productReviewOf(savedProduct) || body.review : body.review,
      );
      setPhase("saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حفظ الفحص.");
    } finally {
      setSaving(false);
    }
  }

  const soundChoice = condition === "sound" && !refused;
  const refusedSoundChoice = condition === "sound" && refused;
  const handText =
    condition === "sound" && refused
      ? "الرجوع إلى مخزن أونلاين"
      : condition === "sound"
        ? "يعود إلى الرف"
        : "يسلم إلى الصيانة";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" dir="rtl">
      <div className="w-full max-w-lg space-y-4 rounded-3xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold text-[#14213D]/60">{row.statusLabel}</p>
            <h2 className="text-lg font-extrabold text-[#14213D]">{row.wooOrderNumber || row.trackingNumber}</h2>
            <p className="text-sm font-bold text-[#14213D]/70">
              {row.customerName || "—"} · {productTitle}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {onBack ? (
              <button type="button" onClick={onBack} className="rounded-full bg-[#F5F5F0] px-3 py-1 text-sm font-extrabold">
                الأصناف
              </button>
            ) : null}
            <button type="button" onClick={onClose} className="rounded-full bg-[#F5F5F0] px-3 py-1 text-sm font-extrabold">
              إغلاق
            </button>
          </div>
        </div>
        {row.confirmationId ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/cs/orders/${row.confirmationId}`} className="inline-block text-sm font-extrabold text-[#14213D] underline">
              فتح صفحة الأوردر
            </Link>
            <OrderSalahiaChip confirmationId={row.confirmationId} />
          </div>
        ) : null}
        <ReturnTrackLine
          trackingNumber={row.trackingNumber}
          confirmationId={row.confirmationId}
          forceShow
        />
        {phase === "saved" && savedReview ? (
          <div className="space-y-3">
            <p className="rounded-2xl bg-emerald-50 px-4 py-6 text-center text-xl font-extrabold text-emerald-900">{savedReview.label}</p>
            <button
              type="button"
              onClick={() => setPhase("choose")}
              className="w-full rounded-2xl bg-[#F5F5F0] px-4 py-3 text-sm font-extrabold"
            >
              تعديل
            </button>
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="w-full rounded-2xl bg-[#14213D] px-4 py-3 text-sm font-extrabold text-white"
              >
                صنف تالي
              </button>
            ) : null}
          </div>
        ) : null}
        {phase === "choose" ? (
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => choose("sound")} className="rounded-2xl bg-[#14213D] px-4 py-8 text-xl font-extrabold text-white">
              سليم
            </button>
            <button
              type="button"
              onClick={() => choose(refused ? "broken" : "defective")}
              className="rounded-2xl bg-[#E6B325] px-4 py-8 text-xl font-extrabold text-black"
            >
              {refused ? "مكسور" : "معيب"}
            </button>
          </div>
        ) : null}
        {phase === "defects" ? (
          <div className="space-y-3">
            <p className="text-sm font-extrabold text-[#14213D]">اختَر العيب. يمكن أكثر من واحد.</p>
            <div className="grid grid-cols-2 gap-2">
              {DEFECTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleDefect(item.id)}
                  className={`rounded-2xl px-3 py-4 text-sm font-extrabold ${
                    defects.includes(item.id) ? "bg-[#E6B325] text-black" : "bg-[#F5F5F0] text-[#14213D]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={!defects.length}
              onClick={() => setPhase("usage")}
              className="w-full rounded-2xl bg-[#14213D] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-40"
            >
              التالي
            </button>
          </div>
        ) : null}
        {phase === "usage" ? (
          <div className="space-y-3">
            <p className="text-sm font-extrabold text-[#14213D]">بعد المعاينة: المنتج جديد ولا مستخدم؟ (اختيار واحد)</p>
            <div className="flex flex-wrap gap-4">
              {USAGE_OPTIONS.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-base font-extrabold text-[#14213D]">
                  <input
                    type="checkbox"
                    className="size-5 accent-[#E6B325]"
                    checked={usage === item.id}
                    onChange={() => setUsage(item.id)}
                  />
                  {item.label}
                </label>
              ))}
            </div>
            <button
              type="button"
              disabled={usage !== "new" && usage !== "used"}
              onClick={() => setPhase("hand")}
              className="w-full rounded-2xl bg-[#14213D] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-40"
            >
              التالي
            </button>
          </div>
        ) : null}
        {phase === "hand" ? (
          <div className="space-y-3">
            {soundChoice ? (
              <>
                <p className="text-center text-sm font-extrabold text-[#14213D]/70">اختَر الوجهة بعد المعاينة</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void finish("shelf")}
                    className="rounded-2xl bg-[#14213D] px-4 py-8 text-xl font-extrabold text-white disabled:opacity-60"
                  >
                    {saving ? "جارٍ الحفظ…" : "يعود إلى الرف"}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void finish("maintenance")}
                    className="rounded-2xl bg-[#E6B325] px-4 py-8 text-xl font-extrabold text-black disabled:opacity-60"
                  >
                    {saving ? "جارٍ الحفظ…" : "إلى الصيانة"}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void finish("to_customer")}
                    className="rounded-2xl bg-[#FFF200] px-4 py-8 text-xl font-extrabold text-[#14213D] disabled:opacity-60"
                  >
                    {saving ? "جارٍ الحفظ…" : "يعود إلى العميل"}
                  </button>
                </div>
              </>
            ) : refusedSoundChoice ? (
              <>
                <p className="text-center text-sm font-extrabold text-[#14213D]/70">اختَر الوجهة بعد المعاينة</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void finish()}
                    className="rounded-2xl bg-[#14213D] px-4 py-8 text-xl font-extrabold text-white disabled:opacity-60"
                  >
                    {saving ? "جارٍ الحفظ…" : "الرجوع إلى مخزن أونلاين"}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void finish("maintenance")}
                    className="rounded-2xl bg-[#E6B325] px-4 py-8 text-xl font-extrabold text-black disabled:opacity-60"
                  >
                    {saving ? "جارٍ الحفظ…" : "إلى الصيانة"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="rounded-2xl bg-[#F5F5F0] px-4 py-8 text-center text-xl font-extrabold text-[#14213D]">{handText}</p>
                {condition === "broken" && !deskReturn ? (
                  <button type="button" onClick={() => setPhase("claim")} className="w-full rounded-2xl bg-[#14213D] px-4 py-3 text-sm font-extrabold text-white">
                    التالي
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void finish()}
                    className="w-full rounded-2xl bg-[#14213D] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60"
                  >
                    {saving ? "جارٍ الحفظ…" : "تم"}
                  </button>
                )}
              </>
            )}
          </div>
        ) : null}
        {phase === "claim" && !deskReturn ? (
          <div className="space-y-3">
            <p className="rounded-2xl bg-[#F5F5F0] px-4 py-8 text-center text-xl font-extrabold text-[#14213D]">رفع تذكرة للتعويض من بوسطة</p>
            <button
              type="button"
              disabled={saving}
              onClick={() => void finish()}
              className="w-full rounded-2xl bg-[#14213D] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60"
            >
              {saving ? "جارٍ الحفظ…" : "تم"}
            </button>
          </div>
        ) : null}
        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
      </div>
    </div>
  );
}

export function MaintenanceClient({
  canInspect = true,
  canTech = false,
  canAccounting = false,
  initialHub,
}: {
  canInspect?: boolean;
  canTech?: boolean;
  canAccounting?: boolean;
  initialHub?: HubTab;
}) {
  const defaultHub: HubTab = canInspect ? "inspect" : canTech ? "tech" : canAccounting ? "accounting" : "inspect";
  const startHub: HubTab =
    initialHub === "variance" ||
    initialHub === "tech" ||
    initialHub === "tech_report" ||
    initialHub === "receive" ||
    initialHub === "accounting" ||
    initialHub === "inspect"
      ? initialHub
      : defaultHub;
  const [data, setData] = useState<Payload | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<TabId>("bosta");
  const [hubTab, setHubTab] = useState<HubTab>(startHub);
  const [kinds, setKinds] = useState<Kind[]>(["refused", "exchange", "return"]);
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("all");
  const [destinationFilter, setDestinationFilter] = useState<DestinationFilter>("all");
  const [grouped, setGrouped] = useState(false);
  const [active, setActive] = useState<BostaRow | null>(null);
  const [activeProductId, setActiveProductId] = useState<number | null>(null);
  const [linking, setLinking] = useState<BostaRow | null>(null);
  const [noteRow, setNoteRow] = useState<BostaRow | null>(null);
  const [ticketRow, setTicketRow] = useState<BostaRow | null>(null);
  const [ticketBadges, setTicketBadges] = useState<DeskTicketBadge[] | null>(null);
  const [printMode, setPrintMode] = useState<"all" | "maintenance">("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (range?: { from: string; to: string }) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (range?.from) params.set("from", range.from);
      if (range?.to) params.set("to", range.to);
      params.set("variance", "1");
      const suffix = `?${params.toString()}`;
      const response = await fetch(`/api/cs/maintenance/returns${suffix}`, { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as
        | (Payload & { message?: string; detail?: string; partial?: boolean })
        | null;
      if (!response.ok || !body) {
        const base = body?.message || "تعذر تحميل المرتجعات.";
        setError(body?.detail ? `${base} (${body.detail})` : base);
        return null;
      }
      setData(body);
      setFrom(body.from);
      setTo(body.to);
      if (body.message && body.partial) {
        setError(body.detail ? `${body.message} (${body.detail})` : body.message);
      }
      return body;
    } catch {
      setError("تعذر تحميل المرتجعات. تحقق من الاتصال وحاول مرة أخرى.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const first = await load();
      if (!canInspect) return;
      try {
        const response = await fetch("/api/cs/maintenance/returns/capture", { method: "POST" });
        const body = (await response.json()) as { message?: string; found?: number; saved?: number };
        if (response.ok) {
          const saved = body.saved ?? 0;
          const found = body.found ?? 0;
          if (saved > 0 || found > 0) {
            setNotice(`اتحدّث من بوسطة: ${saved} جديد من ${found} ظاهر.`);
          }
          await load({ from: first?.from || "", to: first?.to || "" });
        }
      } catch {
        // keep the first load even if live pull fails
      }
    })();
  }, [load, canInspect]);

  function patchCapturedRow(trackingNumber: string, patch: (row: BostaRow) => BostaRow) {
    const map = (rows: BostaRow[]) =>
      rows.map((row) => (row.trackingNumber === trackingNumber ? patch(row) : row));
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        bosta: { ...current.bosta, rows: map(current.bosta.rows) },
        temima: { ...current.temima, rows: map(current.temima.rows) },
        eid: { ...current.eid, rows: map(current.eid.rows) },
        momen: { ...current.momen, rows: map(current.momen.rows) },
      };
    });
    setActive((current) => (current && current.trackingNumber === trackingNumber ? patch(current) : current));
  }

  function tabSourceRows(payload: Payload | null, currentTab: TabId) {
    if (!payload) return [] as BostaRow[];
    if (currentTab === "bosta") return payload.bosta.rows;
    if (currentTab === "temima") return payload.temima.rows;
    if (currentTab === "eid") return payload.eid.rows;
    return payload.momen.rows;
  }

  function findCapturedRow(trackingNumber: string) {
    return tabSourceRows(data, "bosta")
      .concat(tabSourceRows(data, "temima"), tabSourceRows(data, "eid"), tabSourceRows(data, "momen"))
      .find((row) => row.trackingNumber === trackingNumber);
  }

  async function openReview(row: BostaRow) {
    setActive(row);
    setActiveProductId(null);
    if (!canInspect) return;
    try {
      const response = await fetch("/api/cs/maintenance/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "open", trackingNumber: row.trackingNumber }),
      });
      const body = (await response.json()) as { openedAt?: string | null };
      if (response.ok && body.openedAt) {
        patchCapturedRow(row.trackingNumber, (item) => ({
          ...item,
          openedAt: item.openedAt || body.openedAt || null,
        }));
      }
    } catch {
      // ignore open stamp failures
    }
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    void load({ from, to });
  }

  async function capture() {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/cs/maintenance/returns/capture", { method: "POST" });
      const body = (await response.json()) as { message?: string; found?: number; saved?: number };
      if (!response.ok) {
        setError(body.message || "تعذر حفظ مرتجعات بوسطة.");
        return;
      }
      setNotice(`اتحفظ ${body.saved ?? 0} من ${body.found ?? 0} ظاهرين على بوسطة.`);
      await load({ from, to });
    } catch {
      setError("تعذر حفظ مرتجعات بوسطة.");
    } finally {
      setSaving(false);
    }
  }

  function toggleKind(kind: Kind) {
    setKinds((current) => (current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind]));
  }

  function patchProducts(trackingNumber: string, linkedProducts: LinkedProduct[]) {
    patchCapturedRow(trackingNumber, (row) => {
      const product = productsLabel(linkedProducts, row.orderProduct);
      return { ...row, linkedProducts, product, searchText: `${row.searchText} ${product}` };
    });
  }

  function rememberProduct(trackingNumber: string, linkedProduct: LinkedProduct) {
    const current = findCapturedRow(trackingNumber);
    const existing = current?.linkedProducts || [];
    const next = existing.some((item) => item.productId === linkedProduct.productId)
      ? existing.map((item) => (item.productId === linkedProduct.productId ? linkedProduct : item))
      : [...existing, linkedProduct];
    patchProducts(trackingNumber, next);
  }

  async function removeProduct(trackingNumber: string, productId: number) {
    setError("");
    try {
      const response = await fetch("/api/cs/maintenance/returns/product", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingNumber, productId }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(body.message || "تعذر شيل المنتج.");
        return;
      }
      const current = findCapturedRow(trackingNumber);
      patchProducts(
        trackingNumber,
        (current?.linkedProducts || []).filter((item) => item.productId !== productId),
      );
    } catch {
      setError("تعذر شيل المنتج.");
    }
  }

  function rememberReview(trackingNumber: string, review: Review, product?: LinkedProduct | null) {
    patchCapturedRow(trackingNumber, (row) => {
      let linkedProducts = row.linkedProducts || [];
      if (product) {
        const exists = linkedProducts.some((item) => item.productId === product.productId);
        linkedProducts = exists
          ? linkedProducts.map((item) =>
              item.productId === product.productId ? { ...item, ...product } : item,
            )
          : [...linkedProducts, product];
      }
      const productLabel = productsLabel(linkedProducts, row.orderProduct);
      return {
        ...row,
        review,
        linkedProducts,
        product: productLabel || row.product,
        searchText: `${row.searchText} ${review.label} ${productLabel}`,
      };
    });
  }

  function visible<T extends { searchText: string }>(rows: T[]) {
    return rows.filter((row) => matchesQuery(row.searchText, query));
  }

  const bostaSearched = visible(tabSourceRows(data, tab));
  const bostaFiltered = bostaSearched.filter((row) => {
    if (!kinds.includes(row.kind)) return false;
    if (usageFilter === "new" || usageFilter === "used") {
      const candidates = inspectCandidates(row);
      if (candidates.length) {
        if (!candidates.some((product) => product.usage === usageFilter)) return false;
      } else if (row.review?.usage !== usageFilter) {
        return false;
      }
    } else if (usageFilter === "unset") {
      const candidates = inspectCandidates(row);
      if (candidates.length) {
        if (candidates.every((product) => product.usage === "new" || product.usage === "used")) {
          return false;
        }
      } else if (row.review?.usage === "new" || row.review?.usage === "used") {
        return false;
      }
    }
    if (destinationFilter === "unreviewed") {
      if (!rowNeedsReview(row)) return false;
    } else if (destinationFilter !== "all") {
      if (!rowMatchesDestination(row, destinationFilter)) return false;
    }
    return true;
  });
  const bostaRows = grouped
    ? [...bostaFiltered].sort(
        (left, right) =>
          KIND_RANK[left.kind] - KIND_RANK[right.kind] ||
          right.day.localeCompare(left.day) ||
          right.trackingNumber.localeCompare(left.trackingNumber),
      )
    : bostaFiltered;
  const printByDestination = DEST_PRINT_ORDER.map((dest) => ({
    ...dest,
    rows: bostaFiltered.filter((row) =>
      dest.id === "unreviewed" ? rowNeedsReview(row) : rowMatchesDestination(row, dest.id),
    ),
  })).filter((group) => group.rows.length > 0);
  const maintenancePrintRows = bostaSearched.filter((row) => rowMatchesDestination(row, "maintenance"));
  const panelRows: PanelRow[] = bostaSearched.flatMap((row): PanelRow[] => {
    const deskTicket = row.deskTicket || null;
    const deskTickets = row.deskTickets?.length ? row.deskTickets : deskTicket ? [deskTicket] : [];
    const maintenanceProducts = row.linkedProducts.filter((product) => product.destination === "maintenance");
    if (maintenanceProducts.length) {
      return maintenanceProducts.map((product): PanelRow => ({
        trackingNumber: row.trackingNumber,
        productId: product.productId,
        wooOrderNumber: row.wooOrderNumber,
        customerName: row.customerName,
        phone: row.phone,
        product: productText(product),
        day: row.day,
        note: row.note || "",
        openedAt: row.openedAt,
        statusLabel: row.statusLabel,
        deskTicket,
        deskTickets,
        review: {
          destination: "maintenance",
          grade: product.grade || null,
          techNote: product.techNote || "",
          deliveredToMaintenanceAt: product.deliveredToMaintenanceAt || null,
          receivedFromMaintenanceAt: product.receivedFromMaintenanceAt || null,
          shelfAt: product.shelfAt || null,
          defects: product.defects || [],
          label: product.label || "صيانة",
          usage: product.usage || null,
        },
      }));
    }
    if (row.review?.destination !== "maintenance") return [];
    return [
      {
        trackingNumber: row.trackingNumber,
        productId: null,
        wooOrderNumber: row.wooOrderNumber,
        customerName: row.customerName,
        phone: row.phone,
        product: row.product,
        day: row.day,
        note: row.note || "",
        openedAt: row.openedAt,
        statusLabel: row.statusLabel,
        deskTicket,
        deskTickets,
        review: {
          destination: row.review.destination,
          grade: row.review.grade,
          techNote: row.review.techNote || "",
          deliveredToMaintenanceAt: row.review.deliveredToMaintenanceAt,
          receivedFromMaintenanceAt: row.review.receivedFromMaintenanceAt,
          shelfAt: row.review.shelfAt,
          defects: row.review.defects,
          label: row.review.label,
          usage: row.review.usage,
        },
      },
    ];
  });
  const usageFilterLabel = USAGE_FILTERS.find((item) => item.id === usageFilter)?.label || "";
  const destFilterLabel = DEST_FILTERS.find((item) => item.id === destinationFilter)?.label || "";
  const hubTabs: Array<{ id: HubTab; label: string; show: boolean }> = [
    { id: "inspect", label: "فحص المرتجع", show: canInspect },
    { id: "tech", label: "فني الصيانة", show: canTech },
    { id: "tech_report", label: "تقرير فني", show: canTech },
    { id: "receive", label: "عائد من الصيانة", show: canInspect },
    { id: "accounting", label: "حسابات الصيانة", show: canAccounting },
    { id: "variance", label: "فروقات", show: canInspect || canTech },
  ];
  const counts = {
    refused: bostaSearched.filter((row) => row.kind === "refused").length,
    exchange: bostaSearched.filter((row) => row.kind === "exchange").length,
    return: bostaSearched.filter((row) => row.kind === "return").length,
  };
  const tabError =
    tab === "bosta"
      ? data?.bosta.error
      : tab === "temima"
        ? data?.temima.error
        : tab === "eid"
          ? data?.eid.error
          : data?.momen.error;
  const tabMissing =
    tab === "eid" && data && !data.eid.found
      ? "المندوب مش متسجل."
      : tab === "momen" && data && !data.momen.found
        ? "المندوب مش متسجل."
        : "";
  const deskReturn = tab !== "bosta";

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap gap-2">
        {hubTabs
          .filter((item) => item.show)
          .map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setHubTab(item.id)}
              className={`rounded-full px-4 py-2 text-sm font-extrabold ${
                hubTab === item.id ? "bg-[#E6B325] text-black" : "bg-white text-[#14213D] ring-1 ring-black/10"
              }`}
            >
              {item.label}
            </button>
          ))}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex gap-2">
          {(hubTab === "inspect" && canInspect) ||
          (hubTab === "tech" && canTech) ||
          (hubTab === "receive" && canInspect) ||
          (hubTab === "accounting" && canAccounting)
            ? TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`rounded-full px-4 py-2 text-sm font-extrabold ${
                    tab === item.id ? "bg-[#14213D] text-white" : "bg-white text-[#14213D] ring-1 ring-black/10"
                  }`}
                >
                  {item.label}
                </button>
              ))
            : null}
        </div>
        <form onSubmit={onSearch} className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-extrabold text-[#14213D]">
            من
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="mt-1 block rounded-xl border border-black/10 px-3 py-2 text-sm font-bold"
            />
          </label>
          <label className="text-xs font-extrabold text-[#14213D]">
            إلى
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="mt-1 block rounded-xl border border-black/10 px-3 py-2 text-sm font-bold"
            />
          </label>
          <label className="min-w-56 flex-1 text-xs font-extrabold text-[#14213D]">
            بحث
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="أوردر أو تليفون أو أي بيان"
              className="mt-1 block w-full rounded-xl border border-black/10 px-3 py-2 text-sm font-bold"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-[#E6B325] px-4 py-2 text-sm font-extrabold text-black disabled:opacity-60"
          >
            {loading ? "جارٍ البحث…" : "بحث"}
          </button>
        </form>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
      {notice ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">{notice}</p> : null}
      <section className="rounded-2xl bg-white shadow-sm ring-1 ring-black/10">
        {hubTab === "tech" && canTech ? (
          <TechPanel
            rows={panelRows}
            onChanged={() => void load({ from, to })}
            onOpenTicket={(tickets) => setTicketBadges(tickets)}
          />
        ) : null}
        {hubTab === "tech_report" && canTech ? <TechReportPanel from={from} to={to} /> : null}
        {hubTab === "receive" && canInspect ? (
          <ReceiveAndShelfPanel rows={panelRows} onChanged={() => void load({ from, to })} />
        ) : null}
        {hubTab === "accounting" && canAccounting ? <AccountingPanel rows={panelRows} /> : null}
        {hubTab === "variance" && (canInspect || canTech) ? (
          <VariancePanel variance={data?.variance || null} />
        ) : null}
        {hubTab === "inspect" && canInspect ? (
          <>
            <header className="space-y-3 border-b border-black/10 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  {KINDS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleKind(item.id)}
                      className={`rounded-full px-3 py-1 text-xs font-extrabold ${
                        kinds.includes(item.id) ? "bg-[#E6B325] text-black" : "bg-[#F5F5F0] text-[#14213D]/50"
                      }`}
                    >
                      {item.label} {counts[item.id]}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPrintMode("all");
                      window.setTimeout(() => window.print(), 50);
                    }}
                    disabled={!bostaRows.length}
                    className="rounded-full bg-white px-4 py-2 text-xs font-extrabold text-[#14213D] ring-1 ring-black/10 disabled:opacity-40"
                  >
                    طباعة
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPrintMode("maintenance");
                      window.setTimeout(() => window.print(), 50);
                    }}
                    disabled={!maintenancePrintRows.length}
                    className="rounded-full bg-[#FCA311] px-4 py-2 text-xs font-extrabold text-black disabled:opacity-40"
                  >
                    طباعة تقرير الصيانة
                  </button>
                  {tab === "bosta" ? (
                    <button
                      type="button"
                      onClick={() => void capture()}
                      disabled={saving}
                      className="rounded-full bg-[#14213D] px-4 py-2 text-xs font-extrabold text-white disabled:opacity-60"
                    >
                      {saving ? "جارٍ الحفظ…" : "حفظ ظاهر بوسطة"}
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {USAGE_FILTERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setUsageFilter(item.id)}
                    className={`rounded-full px-3 py-1 text-xs font-extrabold ${
                      usageFilter === item.id ? "bg-[#14213D] text-white" : "bg-[#F5F5F0] text-[#14213D]/70"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {DEST_FILTERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setDestinationFilter(item.id)}
                    className={`rounded-full px-3 py-1 text-xs font-extrabold ${
                      destinationFilter === item.id ? "bg-[#14213D] text-white" : "bg-[#F5F5F0] text-[#14213D]/70"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </header>
            {tabError ? <p className="px-4 py-3 text-sm font-bold text-red-700">{tabError}</p> : null}
            {tabMissing ? <p className="px-4 py-3 text-sm font-bold text-[#14213D]/60">{tabMissing}</p> : null}
            <div className="w-full">
              <table className="w-full table-fixed text-right text-sm">
                <thead className="bg-[#F5F5F0] text-xs font-extrabold text-[#14213D]">
                  <tr>
                    <th className="w-[7%] px-1 py-2">اليوم</th>
                    <th className="w-[10%] px-1 py-2">البوليصة</th>
                    <th className="w-[6%] px-1 py-2">المسار</th>
                    <th className="w-[9%] px-1 py-2">الأوردر</th>
                    <th className="w-[10%] px-1 py-2">العميل</th>
                    <th className="w-[9%] px-1 py-2">الموبايل</th>
                    <th className="w-[16%] px-1 py-2">المنتج</th>
                    <th className="w-[8%] px-1 py-2">
                      <button type="button" onClick={() => setGrouped((value) => !value)} className="font-extrabold">
                        التصنيف{grouped ? " (مجمّع)" : ""}
                      </button>
                    </th>
                    <th className="w-[7%] px-1 py-2">الفتح</th>
                    <th className="w-[7%] px-1 py-2">التسليم</th>
                    <th className="w-[6%] px-1 py-2">ملاحظة</th>
                    <th className="w-[5%] px-1 py-2">الفحص</th>
                  </tr>
                </thead>
                <tbody>
                  {bostaRows.length ? (
                    bostaRows.map((row) => (
                      <tr
                        key={row.trackingNumber}
                        onClick={() => void openReview(row)}
                        className="cursor-pointer border-t border-black/5 hover:bg-[#F5F5F0]"
                      >
                        <td className="break-words px-1 py-2 text-xs">{row.day || "—"}</td>
                        <td className="break-all px-1 py-2 text-xs font-bold" dir="ltr">
                          {row.trackingNumber}
                        </td>
                        <td className="px-1 py-2" onClick={(event) => event.stopPropagation()}>
                          <ReturnTrackDrawer
                            trackingNumber={row.trackingNumber}
                            confirmationId={row.confirmationId}
                          />
                        </td>
                        <td className="break-words px-1 py-2 text-xs font-extrabold">
                          <span className="inline-flex flex-wrap items-center gap-1">
                            {row.deskTicket ? (
                              <button
                                type="button"
                                title="فتح تكت الاستقبال"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setTicketRow(row);
                                  setTicketBadges(null);
                                }}
                                className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-extrabold text-white"
                              >
                                تكت
                              </button>
                            ) : null}
                            <span>{row.wooOrderNumber || "—"}</span>
                          </span>
                        </td>
                        <td className="break-words px-1 py-2 text-xs">{row.customerName || "—"}</td>
                        <td className="break-all px-1 py-2 text-xs" dir="ltr">
                          {row.phone || "—"}
                        </td>
                        <td className="break-words px-1 py-2" onClick={(event) => event.stopPropagation()}>
                          <div className="flex flex-wrap items-center gap-1">
                            {row.linkedProducts.length
                              ? row.linkedProducts.map((item) => (
                                  <span
                                    key={item.productId}
                                    className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#F5F5F0] px-2 py-1 text-xs font-bold text-[#14213D]"
                                  >
                                    <span className="break-words">{productText(item)}</span>
                                    {item.destination ? (
                                      <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-extrabold ring-1 ring-black/10">
                                        {DEST_BADGE[item.destination]}
                                      </span>
                                    ) : (
                                      <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-900 ring-1 ring-amber-200">
                                        —
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      aria-label="شيل المنتج"
                                      onClick={() => void removeProduct(row.trackingNumber, item.productId)}
                                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-sm font-extrabold text-red-700 ring-1 ring-red-200"
                                    >
                                      −
                                    </button>
                                  </span>
                                ))
                              : row.orderProduct
                                ? <span className="break-words text-xs font-bold text-[#14213D]">{row.orderProduct}</span>
                                : null}
                            <button
                              type="button"
                              aria-label="إضافة منتج"
                              onClick={() => setLinking(row)}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#14213D] text-base font-extrabold text-white"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="break-words px-1 py-2 text-xs">{row.statusLabel}</td>
                        <td className="break-words px-1 py-2 text-[11px]">
                          {formatCairoOrderDateTime(row.openedAt).absolute}
                        </td>
                        <td className="break-words px-1 py-2 text-[11px]">
                          {formatCairoOrderDateTime(row.review?.deliveredToMaintenanceAt).absolute}
                        </td>
                        <td className="px-1 py-2" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setNoteRow(row)}
                            className="rounded-full bg-[#F5F5F0] px-2 py-1 text-[11px] font-extrabold text-[#14213D] ring-1 ring-black/10"
                            title={row.note || "اضغط لكتابة ملاحظة"}
                          >
                            {row.note ? "ملاحظة ✓" : "ملاحظة"}
                          </button>
                        </td>
                        <td className="break-words px-1 py-2 text-xs">{row.review?.label || "—"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={12} className="px-3 py-6 text-center font-bold text-[#14213D]/60">
                        {loading ? "جارٍ التحميل…" : tabMissing || EMPTY_INSPECT[tab]}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>
      {linking ? (
        <ProductSearch
          key={linking.trackingNumber}
          row={linking}
          onClose={() => setLinking(null)}
          onSaved={(product) => rememberProduct(linking.trackingNumber, product)}
        />
      ) : null}
      {noteRow ? (
        <NoteModal
          key={`note-${noteRow.trackingNumber}`}
          trackingNumber={noteRow.trackingNumber}
          initial={noteRow.note || ""}
          onClose={() => setNoteRow(null)}
          onSaved={(note) => {
            patchCapturedRow(noteRow.trackingNumber, (row) => ({ ...row, note }));
          }}
        />
      ) : null}
      {ticketBadges?.length ? (
        <DeskTicketModal
          key={`ticket-badges-${ticketBadges.map((item) => item.id).join("-")}`}
          tickets={ticketBadges}
          onClose={() => setTicketBadges(null)}
        />
      ) : ticketRow?.deskTicket ? (
        <DeskTicketModal
          key={`ticket-${ticketRow.trackingNumber}-${ticketRow.deskTicket.id}`}
          tickets={ticketRow.deskTickets?.length ? ticketRow.deskTickets : [ticketRow.deskTicket]}
          onClose={() => setTicketRow(null)}
        />
      ) : null}
      {active && canInspect && inspectCandidates(active).length >= 1 && activeProductId == null ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" dir="rtl">
          <div className="w-full max-w-lg space-y-4 rounded-3xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold text-[#14213D]/60">{active.statusLabel}</p>
                <h2 className="text-lg font-extrabold text-[#14213D]">
                  {active.wooOrderNumber || active.trackingNumber}
                </h2>
                <p className="text-sm font-bold text-[#14213D]/70">اختَر الصنف للفحص</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActive(null);
                  setActiveProductId(null);
                }}
                className="rounded-full bg-[#F5F5F0] px-3 py-1 text-sm font-extrabold"
              >
                إغلاق
              </button>
            </div>
            <div className="space-y-2">
              {inspectCandidates(active).map((product) => {
                const reviewed = Boolean(product.condition && product.destination);
                return (
                  <button
                    key={product.productId}
                    type="button"
                    onClick={() => setActiveProductId(product.productId)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl bg-[#F5F5F0] px-4 py-3 text-right"
                  >
                    <span>
                      <span className="block text-sm font-extrabold text-[#14213D]">{productText(product)}</span>
                      <span className="block text-xs font-bold text-[#14213D]/60">
                        {reviewed
                          ? product.label ||
                            (product.destination ? DEST_BADGE[product.destination] : "اتفحص")
                          : "لسه متفحصش"}
                      </span>
                    </span>
                    <span
                      className={`rounded-full px-2 py-1 text-[11px] font-extrabold ${
                        reviewed ? "bg-emerald-100 text-emerald-900" : "bg-white text-[#14213D]"
                      }`}
                    >
                      {reviewed ? "✓" : "فحص"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
      {active && canInspect && (inspectCandidates(active).length < 1 || activeProductId != null) ? (
        <ReviewCards
          key={`${active.trackingNumber}-${activeProductId ?? "order"}`}
          row={active}
          product={
            activeProductId != null
              ? inspectCandidates(active).find((item) => item.productId === activeProductId) || null
              : null
          }
          deskReturn={active.source ? active.source !== "bosta" : deskReturn}
          onClose={() => {
            setActive(null);
            setActiveProductId(null);
          }}
          onBack={
            inspectCandidates(active).length >= 1
              ? () => setActiveProductId(null)
              : undefined
          }
          onSaved={(review, product) => rememberReview(active.trackingNumber, review, product)}
        />
      ) : null}
      {hubTab === "inspect" && canInspect && printMode === "all" ? (
        <div className="print-only">
          <h1 className="text-center text-lg font-extrabold">
            {TAB_PRINT[tab]} {from} — {to}
          </h1>
          <p className="mb-2 text-center text-xs font-bold">
            {usageFilterLabel} · {destFilterLabel} · عدد الصفوف: {bostaFiltered.length}
          </p>
          {printByDestination.map((group) => (
            <section key={group.id}>
              <h2 className="mt-4 text-sm font-extrabold">
                {group.label} ({group.rows.length})
              </h2>
              <table className="w-full border-collapse text-right text-xs">
                <thead>
                  <tr>
                    <th className="border border-black px-1 py-1">اليوم</th>
                    <th className="border border-black px-1 py-1">البوليصة</th>
                    <th className="border border-black px-1 py-1">الأوردر</th>
                    <th className="border border-black px-1 py-1">العميل</th>
                    <th className="border border-black px-1 py-1">الموبايل</th>
                    <th className="border border-black px-1 py-1">النوع</th>
                    <th className="border border-black px-1 py-1">المنتج</th>
                    <th className="border border-black px-1 py-1">جديد/مستخدم</th>
                    <th className="border border-black px-1 py-1">الفحص</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((item) => (
                    <tr key={item.trackingNumber}>
                      <td className="border border-black px-1 py-1">{item.day}</td>
                      <td className="border border-black px-1 py-1">{item.trackingNumber}</td>
                      <td className="border border-black px-1 py-1">{item.wooOrderNumber}</td>
                      <td className="border border-black px-1 py-1">{item.customerName}</td>
                      <td className="border border-black px-1 py-1">{item.phone}</td>
                      <td className="border border-black px-1 py-1">{item.statusLabel}</td>
                      <td className="border border-black px-1 py-1">{item.product}</td>
                      <td className="border border-black px-1 py-1">
                        {item.review?.usage === "new" ? "جديد" : item.review?.usage === "used" ? "مستخدم" : ""}
                      </td>
                      <td className="border border-black px-1 py-1">{item.review?.label || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      ) : null}
      {printMode === "maintenance" ? (
        <div className="print-only">
          <h1 className="text-center text-lg font-extrabold">تقرير تسليم للصيانة · {TAB_PRINT[tab]}</h1>
          <p className="mb-2 text-center text-xs font-bold">
            {from} — {to} · عدد الصفوف: {maintenancePrintRows.length}
          </p>
          <table className="w-full border-collapse text-right text-xs">
            <thead>
              <tr>
                <th className="border border-black px-1 py-1">اليوم</th>
                <th className="border border-black px-1 py-1">البوليصة</th>
                <th className="border border-black px-1 py-1">الأوردر</th>
                <th className="border border-black px-1 py-1">العميل</th>
                <th className="border border-black px-1 py-1">الموبايل</th>
                <th className="border border-black px-1 py-1">النوع</th>
                <th className="border border-black px-1 py-1">المنتج</th>
                <th className="border border-black px-1 py-1">العيوب</th>
                <th className="border border-black px-1 py-1">جديد/مستخدم</th>
                <th className="border border-black px-1 py-1">الفتح</th>
                <th className="border border-black px-1 py-1">التسليم</th>
                <th className="border border-black px-1 py-1">الملاحظة</th>
              </tr>
            </thead>
            <tbody>
              {maintenancePrintRows.map((item) => (
                <tr key={item.trackingNumber}>
                  <td className="border border-black px-1 py-1">{item.day}</td>
                  <td className="border border-black px-1 py-1">{item.trackingNumber}</td>
                  <td className="border border-black px-1 py-1">{item.wooOrderNumber}</td>
                  <td className="border border-black px-1 py-1">{item.customerName}</td>
                  <td className="border border-black px-1 py-1">{item.phone}</td>
                  <td className="border border-black px-1 py-1">{item.statusLabel}</td>
                  <td className="border border-black px-1 py-1">{item.product}</td>
                  <td className="border border-black px-1 py-1">{defectsAr(item.review?.defects || [])}</td>
                  <td className="border border-black px-1 py-1">
                    {item.review?.usage === "new" ? "جديد" : item.review?.usage === "used" ? "مستخدم" : ""}
                  </td>
                  <td className="border border-black px-1 py-1">
                    {item.openedAt ? formatCairoOrderDateTime(item.openedAt).absolute : ""}
                  </td>
                  <td className="border border-black px-1 py-1">
                    {item.review?.deliveredToMaintenanceAt
                      ? formatCairoOrderDateTime(item.review.deliveredToMaintenanceAt).absolute
                      : ""}
                  </td>
                  <td className="border border-black px-1 py-1">{item.note || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-8 text-sm font-extrabold">
            استلام مسئول الصيانة: ........................ &nbsp;&nbsp; التاريخ: ..../..../........ &nbsp;&nbsp;
            التوقيع: ........................
          </p>
        </div>
      ) : null}
      <style jsx global>{`
        .print-only {
          display: none;
        }
        @media print {
          body * {
            visibility: hidden !important;
          }
          .print-only,
          .print-only *,
          .tech-report-print,
          .tech-report-print * {
            visibility: visible !important;
          }
          .print-only,
          .tech-report-print {
            display: block !important;
            position: absolute;
            inset: 0;
            padding: 8mm;
            background: white;
            color: black;
          }
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
        }
      `}</style>
    </div>
  );
}
