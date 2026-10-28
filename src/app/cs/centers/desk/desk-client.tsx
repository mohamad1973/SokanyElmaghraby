"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { CsFulfillmentPanel, type FulfillmentSnapshot } from "@/app/cs/orders/fulfillment-panel";

type Access = {
  isManager: boolean;
  canInspect: boolean;
  canTech: boolean;
  canReceive: boolean;
  canRefund: boolean;
  canDesk: boolean;
  centerId: number | null;
  centerName: string;
};

type Photo = { id: number; kind: string; url: string };

type Ticket = {
  id: number;
  centerId: number;
  centerName: string;
  productName: string;
  productCode: string;
  purchaseSource: string;
  purchaseSourceNote: string;
  purchaseDate: string;
  usageKind: string;
  visualKind: string;
  powerCut: boolean;
  defects: string[];
  defectOther: string;
  techSpecs: string;
  inWarranty: boolean | null;
  partAvailable: boolean | null;
  chargeType: string;
  cost: number | null;
  durationText: string;
  techNotes: string;
  refundKind: string;
  refundReason: string;
  hqDecision: string;
  hqNote: string;
  complaintNote: string;
  customerRequest: string;
  staffProposal: string;
  managementNote: string;
  confirmationId: number | null;
  wooOrderNumber: string;
  fulfillmentConfirmationId: number | null;
  waybillCarrier: string;
  waybillTracking: string;
  status: string;
  statusLabel: string;
  createdAt: string | null;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  invoicePhotos: Photo[];
  productPhotos: Photo[];
  complaintPhotos?: Photo[];
  events?: Array<{ id: number; kind: string; message: string; createdAt: string | null }>;
};

type HistoryOrder = {
  wooOrderId?: number;
  wooOrderNumber: string;
  confirmationId?: number | null;
  dateCreated: string;
  statusLabel: string;
  customerName: string;
  phone: string;
  address: string;
  total: string;
  items: Array<{ name: string; quantity: number; total: string; productId?: number }>;
  shippingLabel?: string;
  trackingNumber?: string;
};

type History = {
  siteOrders: HistoryOrder[];
  csOrders: HistoryOrder[];
  bostaShipments: Array<{
    trackingNumber: string;
    statusLabel: string;
    typeLabel?: string;
    createdAt?: string;
    lastEvent: string;
    placeLabel: string;
    cod: number | null;
    businessReference: string;
    customerName?: string;
    address?: string;
  }>;
  siteError: string;
  bostaError: string;
  profile?: { name: string; phone: string; address: string };
};

type Customer = { id: number; phone: string; name: string; address: string };

const FIELD =
  "h-10 w-full rounded-xl border border-[#E5E5E5] bg-[#F5F5F0] px-3 text-sm font-bold text-[#14213D] outline-none focus:border-[#FCA311]";

const DEFECT_LABEL: Record<string, string> = {
  chop: "لا يفرم",
  grind: "لا يطحن",
  suction: "لا يشفط",
  heat: "لا يسخن",
};

function shortWhen(value?: string) {
  const text = String(value || "").trim();
  if (!text) return "";
  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
  }
  return text.slice(0, 16).replace("T", " ");
}

type DeskOrderLoaded = {
  confirmationId: number;
  status: string;
  shippingCompany: string | null;
  trackingNumber: string | null;
  waybillPrinted: boolean;
  sokanyWaybill: boolean;
  snapshot: FulfillmentSnapshot | null;
};

function useDeskOrder(confirmationId: number | null) {
  const [loaded, setLoaded] = useState<DeskOrderLoaded | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!confirmationId) {
      setLoaded(null);
      setError("");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    void fetch(`/api/cs/confirmations/${confirmationId}`)
      .then(async (res) => {
        const body = (await res.json()) as {
          message?: string;
          confirmationId?: number;
          status?: string;
          shippingCompany?: string | null;
          trackingNumber?: string | null;
          waybillPrinted?: boolean;
          sokanyWaybill?: boolean;
          snapshot?: FulfillmentSnapshot | null;
        };
        if (cancelled) return;
        if (!res.ok || !body.confirmationId) {
          setLoaded(null);
          setError(body.message || "تعذر فتح أوردر التأكيد.");
          return;
        }
        setLoaded({
          confirmationId: body.confirmationId,
          status: body.status || "",
          shippingCompany: body.shippingCompany || null,
          trackingNumber: body.trackingNumber || null,
          waybillPrinted: Boolean(body.waybillPrinted),
          sokanyWaybill: Boolean(body.sokanyWaybill),
          snapshot: body.snapshot || null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setLoaded(null);
          setError("تعذر فتح أوردر التأكيد.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [confirmationId]);

  return { loaded, error, loading };
}

function canShowReturnCard(loaded: DeskOrderLoaded | null) {
  const shipping = String(loaded?.shippingCompany || "").trim();
  return (
    loaded?.status === "CONFIRMED" &&
    (shipping === "sayed_temima" || shipping === "eid" || shipping === "momen")
  );
}

function DeskFulfillmentSlot({
  parts,
  confirmationId,
  wooOrderNumber,
  loaded,
  error,
  snapshot,
  onMessage,
  showSummary = false,
}: {
  parts: "card" | "all";
  confirmationId: number | null;
  wooOrderNumber: string;
  loaded: DeskOrderLoaded | null;
  loading: boolean;
  error: string;
  snapshot: FulfillmentSnapshot | null;
  onMessage: (text: string) => void;
  showSummary?: boolean;
}) {
  if (parts === "card" && (!confirmationId || (loaded && !canShowReturnCard(loaded)))) {
    return null;
  }
  if (!confirmationId) {
    return (
      <div className="rounded-2xl bg-white p-4 text-sm font-bold text-[#14213D]/70 shadow ring-1 ring-[#14213D]/10">
        {wooOrderNumber
          ? `أوردر #${wooOrderNumber} من غير تأكيد CS. الاستبدال والبوليصة محتاجين أوردر تأكيد.`
          : "اختَر أوردر تأكيد من شحنات سيد والمندوب عشان الاستبدال وطباعة البوليصة."}
      </div>
    );
  }
  if (!loaded) {
    if (error) {
      return <p className="rounded-2xl bg-white p-4 text-sm font-bold text-red-700 shadow ring-1 ring-[#14213D]/10">{error}</p>;
    }
    if (parts === "card") return null;
    return <p className="rounded-2xl bg-white p-4 text-sm font-bold text-[#14213D]/70 shadow ring-1 ring-[#14213D]/10">جارٍ فتح الأوردر…</p>;
  }
  return (
    <CsFulfillmentPanel
      key={`${loaded.confirmationId}-${parts}`}
      confirmationId={loaded.confirmationId}
      snapshot={snapshot || loaded.snapshot}
      shippingCompany={loaded.shippingCompany}
      sokanyWaybill={loaded.sokanyWaybill}
      confirmed={loaded.status === "CONFIRMED"}
      trackingNumber={loaded.trackingNumber}
      waybillPrinted={loaded.waybillPrinted}
      parts={parts}
      showSummary={showSummary}
      onMessage={onMessage}
    />
  );
}

function emptyForm() {
  return {
    name: "",
    phone: "",
    address: "",
    centerId: "" as number | "",
    productName: "",
    productCode: "",
    wooProductId: null as number | null,
    purchaseSource: "",
    purchaseSourceNote: "",
    purchaseDate: "",
    usageKind: "",
    visualKind: "",
    powerCut: false,
    defects: [] as string[],
    defectOther: "",
    invoiceUrls: [] as string[],
    productUrls: [] as string[],
    complaintUrls: [] as string[],
    complaintNote: "",
    customerRequest: "",
    staffProposal: "",
    confirmationId: null as number | null,
    wooOrderNumber: "",
  };
}

export function ScDeskClient() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"desk" | "approvals">("desk");
  const [access, setAccess] = useState<Access | null>(null);
  const [sources, setSources] = useState<Array<{ id: string; label: string }>>([]);
  const [defects, setDefects] = useState<Array<{ id: string; label: string }>>([]);
  const [centers, setCenters] = useState<Array<{ id: number; name: string }>>([]);
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [history, setHistory] = useState<History | null>(null);
  const [carrier, setCarrier] = useState<"bosta" | "sayed_temima" | "eid" | "momen">("bosta");
  const [form, setForm] = useState(emptyForm());
  const [hits, setHits] = useState<Array<{ id: number; name: string; displayCode: string; sku: string }>>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [quote, setQuote] = useState({
    techSpecs: "",
    inWarranty: false,
    partAvailable: false,
    chargeType: "paid" as "paid" | "warranty_free",
    cost: 0,
    durationText: "",
    techNotes: "",
  });
  const [refund, setRefund] = useState({ kind: "return" as "return" | "exchange", reason: "" });
  const [inbox, setInbox] = useState<Ticket[]>([]);
  const [uploading, setUploading] = useState("");
  const confirmationId = selected?.confirmationId || form.confirmationId || null;
  const wooOrderNumber = selected?.wooOrderNumber || form.wooOrderNumber || "";
  const deskOrder = useDeskOrder(confirmationId);
  const fulfillmentSnapshot: FulfillmentSnapshot | null = deskOrder.loaded
    ? {
        ...(deskOrder.loaded.snapshot || {}),
        customerName: deskOrder.loaded.snapshot?.customerName || form.name || undefined,
        phone: deskOrder.loaded.snapshot?.phone || form.phone || undefined,
        address: deskOrder.loaded.snapshot?.address || form.address || undefined,
      }
    : form.name || form.phone
      ? { customerName: form.name, phone: form.phone, address: form.address }
      : null;

  const loadMeta = useCallback(async () => {
    const res = await fetch("/api/cs/centers/intake");
    const data = (await res.json()) as {
      access?: Access;
      sources?: Array<{ id: string; label: string }>;
      defects?: Array<{ id: string; label: string }>;
      centers?: Array<{ id: number; name: string }>;
    };
    if (!res.ok) return;
    setAccess(data.access || null);
    setSources(data.sources || []);
    setDefects(data.defects || []);
    setCenters(data.centers || []);
    setForm((prev) => ({
      ...prev,
      centerId: data.access?.centerId || prev.centerId,
    }));
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const openTicket = useCallback(async (id: number) => {
    const res = await fetch(`/api/cs/centers/intake?ticketId=${id}`);
    const data = (await res.json()) as { ticket?: Ticket; message?: string };
    if (!res.ok || !data.ticket) {
      setMessage(data.message || "تعذر فتح التذكرة.");
      return;
    }
    setSelected(data.ticket);
    setQuote({
      techSpecs: data.ticket.techSpecs,
      inWarranty: Boolean(data.ticket.inWarranty),
      partAvailable: Boolean(data.ticket.partAvailable),
      chargeType: data.ticket.chargeType === "warranty_free" ? "warranty_free" : "paid",
      cost: data.ticket.cost || 0,
      durationText: data.ticket.durationText,
      techNotes: data.ticket.techNotes,
    });
    setRefund({ kind: data.ticket.refundKind === "exchange" ? "exchange" : "return", reason: data.ticket.refundReason });
    setTab("desk");
  }, []);

  useEffect(() => {
    const id = Number(searchParams.get("ticket") || 0);
    if (id) void openTicket(id);
  }, [openTicket, searchParams]);

  async function search() {
    setLoading(true);
    setMessage("");
    setSelected(null);
    const res = await fetch(`/api/cs/centers/intake?phone=${encodeURIComponent(phone)}`);
    const data = (await res.json()) as {
      message?: string;
      found?: boolean;
      phone?: string;
      customer?: Customer;
      tickets?: Ticket[];
      access?: Access;
      history?: History;
    };
    setLoading(false);
    if (!res.ok) {
      setMessage(data.message || "تعذر البحث.");
      return;
    }
    if (data.access) setAccess(data.access);
    setHistory(data.history || null);
    const profile = data.history?.profile;
    const filledName = (data.customer?.name || profile?.name || "").trim();
    const filledPhone = (data.customer?.phone || profile?.phone || data.phone || phone).trim();
    const filledAddress = (data.customer?.address || profile?.address || "").trim();
    setForm((prev) => ({
      ...emptyForm(),
      name: filledName,
      phone: filledPhone,
      address: filledAddress,
      centerId: prev.centerId || access?.centerId || "",
    }));
    if (data.found && data.customer) {
      setCustomer(data.customer);
      setTickets(data.tickets || []);
      setMessage(data.tickets?.length ? `اتفتح ملف ${filledName || data.customer.name}` : "العميل معروف. مفيش زيارات في الفرع ده.");
    } else {
      setCustomer(null);
      setTickets([]);
      setMessage(filledName ? `اتعبّت بيانات ${filledName} من السيستم.` : "عميل جديد. سجّل بياناته.");
    }
  }

  useEffect(() => {
    const term = form.productName.trim();
    if (form.wooProductId || term.length < 2) {
      setHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void fetch(`/api/cs/centers/products?q=${encodeURIComponent(term)}`)
        .then(async (res) => {
          const body = (await res.json()) as { products?: Array<{ id: number; name: string; displayCode: string; sku: string }> };
          setHits(Array.isArray(body.products) ? body.products : []);
        })
        .catch(() => setHits([]));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [form.productName, form.wooProductId]);

  function pickOrder(row: HistoryOrder) {
    const first = row.items[0];
    setForm((prev) => ({
      ...prev,
      confirmationId: row.confirmationId || prev.confirmationId,
      wooOrderNumber: row.wooOrderNumber,
      purchaseSource: "online",
      purchaseDate: String(row.dateCreated || "").slice(0, 10),
      name: row.customerName || prev.name,
      phone: row.phone || prev.phone,
      address: row.address || prev.address,
      productName: first?.name || prev.productName,
      wooProductId: first?.productId || prev.wooProductId,
    }));
    setMessage(`اتربط التكت بأوردر #${row.wooOrderNumber}`);
  }

  async function upload(kind: "invoice" | "product" | "complaint", file: File) {
    setUploading(kind);
    const body = new FormData();
    body.set("file", file);
    body.set("purpose", "sc-ticket-photo");
    const res = await fetch("/api/cs/upload", { method: "POST", body });
    const data = (await res.json()) as { url?: string; message?: string };
    setUploading("");
    if (!res.ok || !data.url) {
      setMessage(data.message || "تعذر رفع الصورة.");
      return;
    }
    setForm((prev) =>
      kind === "invoice"
        ? { ...prev, invoiceUrls: [...prev.invoiceUrls, data.url!] }
        : kind === "complaint"
          ? { ...prev, complaintUrls: [...prev.complaintUrls, data.url!] }
          : { ...prev, productUrls: [...prev.productUrls, data.url!] },
    );
  }

  async function post(payload: Record<string, unknown>, okText: string) {
    setLoading(true);
    setMessage("");
    const res = await fetch("/api/cs/centers/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { message?: string; id?: number; printUrl?: string; trackingNumber?: string };
    setLoading(false);
    if (!res.ok) {
      setMessage(data.message || "تعذر الحفظ.");
      return false;
    }
    setMessage(data.trackingNumber ? `${okText} · تتبع ${data.trackingNumber}` : okText);
    if (data.printUrl) window.open(data.printUrl, "_blank", "noopener,noreferrer");
    if (data.id) await openTicket(data.id);
    else if (selected) await openTicket(selected.id);
    if (form.phone) {
      const refresh = await fetch(`/api/cs/centers/intake?phone=${encodeURIComponent(form.phone)}`);
      const body = (await refresh.json()) as { customer?: Customer; tickets?: Ticket[] };
      if (body.customer) {
        setCustomer(body.customer);
        setTickets(body.tickets || []);
      }
    }
    return true;
  }

  async function loadInbox() {
    const res = await fetch("/api/cs/centers/intake?inbox=1");
    const data = (await res.json()) as { items?: Ticket[]; message?: string };
    if (!res.ok) {
      setMessage(data.message || "تعذر تحميل الموافقات.");
      return;
    }
    setInbox(data.items || []);
  }

  useEffect(() => {
    if (tab === "approvals" && access?.isManager) void loadInbox();
  }, [tab, access?.isManager]);

  return (
    <div className="space-y-4" dir="rtl">
      <div>
        <h1 className="text-2xl font-extrabold text-[#14213D]">استقبال المركز</h1>
        <p className="text-sm font-bold text-[#14213D]/70">
          {access?.centerName ? `فرع ${access.centerName}` : "بحث بالموبايل: أوردرات الموقع والشحنات ثم تسجيل الشكوى."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`rounded-xl px-3 py-2 text-sm font-extrabold ${tab === "desk" ? "bg-[#14213D] text-white" : "bg-[#E5E5E5]"}`} onClick={() => setTab("desk")}>
          المكتب
        </button>
        {access?.isManager ? (
          <button type="button" className={`rounded-xl px-3 py-2 text-sm font-extrabold ${tab === "approvals" ? "bg-[#14213D] text-white" : "bg-[#E5E5E5]"}`} onClick={() => setTab("approvals")}>
            الموافقات والإشعارات
          </button>
        ) : null}
      </div>
      {message ? <p className="rounded-xl bg-[#14213D] px-3 py-2 text-sm font-bold text-white">{message}</p> : null}

      {tab === "approvals" && access?.isManager ? (
        <div className="space-y-2">
          {inbox.map((row) => (
            <button
              key={row.id}
              type="button"
              className="block w-full rounded-2xl bg-white p-4 text-right shadow ring-1 ring-[#14213D]/10"
              onClick={() => void openTicket(row.id)}
            >
              <p className="font-extrabold text-[#14213D]">
                {row.customerName} · {row.statusLabel}
              </p>
              <p className="text-xs font-bold text-[#14213D]/70">
                {row.centerName} · {row.productName} · <span dir="ltr">{row.customerPhone}</span>
              </p>
            </button>
          ))}
          {!inbox.length ? <p className="rounded-2xl bg-white p-4 text-sm font-bold text-[#14213D]/70">مفيش طلبات معلّقة.</p> : null}
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2" dir="ltr">
          <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto" dir="rtl">
            <DeskFulfillmentSlot
              parts="card"
              confirmationId={confirmationId}
              wooOrderNumber={wooOrderNumber}
              loaded={deskOrder.loaded}
              loading={deskOrder.loading}
              error={deskOrder.error}
              snapshot={fulfillmentSnapshot}
              onMessage={setMessage}
            />
          </div>
          <div className="space-y-4 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto" dir="rtl">
          <form
            className="flex flex-wrap gap-2 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10"
            onSubmit={(event) => {
              event.preventDefault();
              void search();
            }}
          >
            <input className={`${FIELD} max-w-xs`} dir="ltr" placeholder="رقم الموبايل" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <button disabled={loading} className="h-10 rounded-xl bg-[#FCA311] px-4 text-sm font-extrabold text-black disabled:opacity-60">
              بحث
            </button>
          </form>

          {history ? (
            <div className="grid gap-3">
              <section className="rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
                <h2 className="font-extrabold text-[#14213D]">أوردرات الموقع ({history.siteOrders.length})</h2>
                {history.siteError ? <p className="text-xs font-bold text-red-700">{history.siteError}</p> : null}
                <div className="mt-2 space-y-2">
                  {history.siteOrders.map((row) => (
                    <button
                      key={`woo-${row.wooOrderNumber}`}
                      type="button"
                      onClick={() => pickOrder(row)}
                      className={`block w-full rounded-xl px-3 py-2 text-right text-xs font-bold ${form.wooOrderNumber === row.wooOrderNumber ? "bg-[#14213D] text-white" : "bg-[#F5F5F0]"}`}
                    >
                      #{row.wooOrderNumber} · {row.statusLabel} · {row.total} ج.م
                      <span className="block text-[11px] opacity-80">{String(row.dateCreated || "").slice(0, 10)}</span>
                      {row.items.map((item) => (
                        <span key={`${item.name}-${item.quantity}`} className="block opacity-90">
                          {item.name} × {item.quantity}
                        </span>
                      ))}
                    </button>
                  ))}
                  {!history.siteOrders.length ? <p className="text-xs font-bold text-[#14213D]/70">مفيش أوردرات على الموقع بالرقم ده.</p> : null}
                </div>
              </section>
              <section className="rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
                <h2 className="font-extrabold text-[#14213D]">شحنات سيد والمندوب ({history.csOrders.length})</h2>
                <div className="mt-2 space-y-2">
                  {history.csOrders.map((row) => (
                    <button
                      key={`cs-${row.confirmationId || row.wooOrderNumber}`}
                      type="button"
                      onClick={() => pickOrder(row)}
                      className={`block w-full rounded-xl px-3 py-2 text-right text-xs font-bold ${form.confirmationId && form.confirmationId === row.confirmationId ? "bg-[#14213D] text-white" : "bg-[#F5F5F0]"}`}
                    >
                      #{row.wooOrderNumber} · {row.shippingLabel || ""} · {row.statusLabel}
                      {row.trackingNumber ? <span className="block" dir="ltr">{row.trackingNumber}</span> : null}
                      {row.total ? <span className="block">{row.total} ج.م</span> : null}
                    </button>
                  ))}
                  {!history.csOrders.length ? <p className="text-xs font-bold text-[#14213D]/70">مفيش أوردرات تأكيد بنفس الرقم.</p> : null}
                </div>
              </section>
              <section className="rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
                <h2 className="font-extrabold text-[#14213D]">شحنات بوسطة ({history.bostaShipments.length})</h2>
                {history.bostaError ? <p className="text-xs font-bold text-[#14213D]/70">{history.bostaError}</p> : null}
                <div className="mt-2 space-y-2">
                  {history.bostaShipments.map((row) => (
                    <div key={row.trackingNumber} className="rounded-xl bg-[#F5F5F0] px-3 py-2 text-xs font-bold">
                      <p dir="ltr">{row.trackingNumber}</p>
                      <p>
                        {row.typeLabel || "توصيل"} · {row.statusLabel || "بدون حالة"}
                      </p>
                      {row.createdAt ? <p className="text-[#14213D]/70">{shortWhen(row.createdAt)}</p> : null}
                      {row.lastEvent ? <p className="text-[#14213D]/70">{row.lastEvent}</p> : null}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          {customer ? (
            <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
              <p className="font-extrabold text-[#14213D]">{customer.name}</p>
              <p className="text-xs font-bold" dir="ltr">
                {customer.phone}
              </p>
              <p className="text-xs font-bold text-[#14213D]/70">{customer.address}</p>
              <div className="mt-3 space-y-2">
                {tickets.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => void openTicket(row.id)}
                    className={`block w-full rounded-xl px-3 py-2 text-right text-sm font-bold ${selected?.id === row.id ? "bg-[#14213D] text-white" : "bg-[#F5F5F0]"}`}
                  >
                    {row.productName} · {row.statusLabel} · {row.centerName}
                    {row.cost != null ? ` · ${row.cost} ج.م` : ""}
                  </button>
                ))}
                {!tickets.length ? <p className="text-xs font-bold text-[#14213D]/70">لا زيارات سابقة في النطاق المتاح.</p> : null}
              </div>
            </div>
          ) : null}

          {selected ? (
            <div className="space-y-3 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10">
              <h2 className="font-extrabold text-[#14213D]">
                {selected.productName} · {selected.statusLabel}
              </h2>
              <p className="text-xs font-bold text-[#14213D]/70">
                {selected.usageKind === "new" ? "جديد" : selected.usageKind === "used" ? "مستخدم" : "بدون معاينة"} · {selected.visualKind === "broken" ? "به كسر" : selected.visualKind === "intact" ? "سليم ظاهريًا" : ""}
                {selected.powerCut ? " · فاصل باور" : ""}
                {selected.defects.map((id) => ` · ${DEFECT_LABEL[id] || id}`).join("")}
                {selected.defectOther ? ` · ${selected.defectOther}` : ""}
              </p>
              {selected.wooOrderNumber ? (
                <p className="text-xs font-bold text-[#14213D]/70">أوردر مربوط #{selected.wooOrderNumber}</p>
              ) : null}
              {selected.complaintNote ? <p className="text-sm font-bold">الشكوى: {selected.complaintNote}</p> : null}
              {selected.customerRequest ? <p className="text-sm font-bold">طلب العميل: {selected.customerRequest}</p> : null}
              {selected.staffProposal ? <p className="text-sm font-bold">اقتراح الموظف: {selected.staffProposal}</p> : null}
              {selected.managementNote ? <p className="text-sm font-bold">قرار الإدارة: {selected.managementNote}</p> : null}
              <div className="flex flex-wrap gap-2">
                {[...selected.invoicePhotos, ...selected.productPhotos, ...(selected.complaintPhotos || [])].map((photo) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={photo.id} src={photo.url} alt="" className="h-16 w-16 rounded-lg object-cover" />
                ))}
              </div>
              {selected.techSpecs ? (
                <p className="text-sm font-bold">
                  التقييم: {selected.techSpecs} · {selected.inWarranty ? "في الضمان" : "خارج الضمان"} ·{" "}
                  {selected.partAvailable ? "القطعة متوفرة" : "القطعة غير متوفرة"} · {selected.chargeType === "warranty_free" ? "مجاني" : `${selected.cost ?? 0} ج.م`} · {selected.durationText}
                </p>
              ) : null}
              {selected.techNotes ? <p className="text-sm font-bold">ملاحظات: {selected.techNotes}</p> : null}
              {selected.refundKind ? (
                <p className="text-sm font-bold">
                  طلب {selected.refundKind === "exchange" ? "استبدال" : "استرجاع"}: {selected.refundReason}
                  {selected.hqDecision ? ` · قرار: ${selected.hqDecision === "approved" ? "موافقة" : "رفض"} ${selected.hqNote}` : ""}
                </p>
              ) : null}

              {access?.canTech && ["intake", "quoted"].includes(selected.status) ? (
                <div className="space-y-2 border-t border-[#14213D]/10 pt-3">
                  <textarea className={`${FIELD} h-20 py-2`} placeholder="مواصفات وتقييم الفني" value={quote.techSpecs} onChange={(e) => setQuote({ ...quote, techSpecs: e.target.value })} />
                  <label className="flex items-center gap-2 text-xs font-bold">
                    <input type="checkbox" className="size-4 accent-[#FCA311]" checked={quote.inWarranty} onChange={(e) => setQuote({ ...quote, inWarranty: e.target.checked })} />
                    في الضمان
                  </label>
                  <label className="flex items-center gap-2 text-xs font-bold">
                    <input type="checkbox" className="size-4 accent-[#FCA311]" checked={quote.partAvailable} onChange={(e) => setQuote({ ...quote, partAvailable: e.target.checked })} />
                    قطعة الغيار متوفرة
                  </label>
                  <select className={FIELD} value={quote.chargeType} onChange={(e) => setQuote({ ...quote, chargeType: e.target.value as "paid" | "warranty_free" })}>
                    <option value="paid">بمقابل مادي</option>
                    <option value="warranty_free">ضمان مجاني</option>
                  </select>
                  {quote.chargeType === "paid" ? (
                    <input className={FIELD} type="number" min={0} placeholder="التكلفة" value={quote.cost} onChange={(e) => setQuote({ ...quote, cost: Number(e.target.value) || 0 })} />
                  ) : null}
                  <input className={FIELD} placeholder="مدة الإصلاح" value={quote.durationText} onChange={(e) => setQuote({ ...quote, durationText: e.target.value })} />
                  <textarea className={`${FIELD} h-16 py-2`} placeholder="ملاحظات الفني" value={quote.techNotes} onChange={(e) => setQuote({ ...quote, techNotes: e.target.value })} />
                  <button
                    type="button"
                    disabled={loading}
                    className="h-10 rounded-xl bg-[#FCA311] px-4 text-sm font-extrabold text-black disabled:opacity-60"
                    onClick={() => void post({ action: "quote", ticketId: selected.id, ...quote }, "اتحفظ التقييم. اعرض التكلفة والمدة على العميل.")}
                  >
                    حفظ التقييم
                  </button>
                </div>
              ) : null}

              {selected.status === "quoted" ? (
                <div className="flex flex-wrap gap-2">
                  {access?.canReceive ? (
                    <button type="button" disabled={loading} className="h-10 rounded-xl bg-emerald-700 px-4 text-sm font-extrabold text-white disabled:opacity-60" onClick={() => void post({ action: "receive", ticketId: selected.id, techNotes: quote.techNotes }, "تم استلام المنتج للإصلاح.")}>
                      العميل وافق · استلام المنتج
                    </button>
                  ) : null}
                  <button type="button" disabled={loading} className="h-10 rounded-xl bg-red-700 px-4 text-sm font-extrabold text-white disabled:opacity-60" onClick={() => void post({ action: "decline", ticketId: selected.id }, "اتسجل رفض الإصلاح.")}>
                    رفض الإصلاح
                  </button>
                </div>
              ) : null}

              {access?.canRefund && !["return_pending", "exchange_pending"].includes(selected.status) ? (
                <div className="space-y-2 border-t border-[#14213D]/10 pt-3">
                  <select className={FIELD} value={refund.kind} onChange={(e) => setRefund({ ...refund, kind: e.target.value as "return" | "exchange" })}>
                    <option value="return">استرجاع</option>
                    <option value="exchange">استبدال</option>
                  </select>
                  <textarea className={`${FIELD} h-16 py-2`} placeholder="سبب الطلب" value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} />
                  <button type="button" disabled={loading} className="h-10 rounded-xl bg-[#14213D] px-4 text-sm font-extrabold text-white disabled:opacity-60" onClick={() => void post({ action: "refund", ticketId: selected.id, ...refund }, "الطلب اتبعت لمدير المراكز.")}>
                    إرسال لمدير المراكز
                  </button>
                </div>
              ) : null}

              {access?.isManager && ["return_pending", "exchange_pending"].includes(selected.status) ? (
                <div className="space-y-2">
                  <textarea className={`${FIELD} h-16 py-2`} placeholder="قرار الإدارة الاستثنائي" value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={loading} className="h-10 rounded-xl bg-emerald-700 px-4 text-sm font-extrabold text-white" onClick={() => void post({ action: "decide", ticketId: selected.id, decision: "approved", note: refund.reason }, "تمت الموافقة.")}>
                      موافقة
                    </button>
                    <button type="button" disabled={loading} className="h-10 rounded-xl bg-red-700 px-4 text-sm font-extrabold text-white" onClick={() => void post({ action: "decide", ticketId: selected.id, decision: "rejected", note: refund.reason }, "تم الرفض.")}>
                      رفض
                    </button>
                  </div>
                </div>
              ) : null}

              {["return_approved", "exchange_approved"].includes(selected.status) &&
              !(form.confirmationId || selected.confirmationId) ? (
                <div className="space-y-2 border-t border-[#14213D]/10 pt-3">
                  <h3 className="text-sm font-extrabold">بوليصة الاسترجاع / الاستبدال</h3>
                  {selected.waybillTracking ? (
                    <p className="text-sm font-bold">
                      {selected.waybillCarrier} · <span dir="ltr">{selected.waybillTracking}</span>
                    </p>
                  ) : null}
                  {!selected.confirmationId && !selected.wooOrderNumber ? (
                    <p className="text-xs font-bold text-red-700">البوليصة محتاجة أوردر من الموقع. شراء التاجر يتعمل استلام حضوري.</p>
                  ) : (
                    <>
                      <select className={FIELD} value={carrier} onChange={(e) => setCarrier(e.target.value as typeof carrier)}>
                        <option value="bosta">بوسطة</option>
                        <option value="sayed_temima">سيد تميمة</option>
                        <option value="eid">عيد</option>
                        <option value="momen">مؤمن</option>
                      </select>
                      <button
                        type="button"
                        disabled={loading}
                        className="h-10 rounded-xl bg-[#FCA311] px-4 text-sm font-extrabold text-black disabled:opacity-60"
                        onClick={() => void post({ action: "waybill", ticketId: selected.id, carrier }, "تم إنشاء البوليصة.")}
                      >
                        إنشاء البوليصة
                      </button>
                    </>
                  )}
                </div>
              ) : selected.waybillTracking ? (
                <p className="text-sm font-bold">
                  {selected.waybillCarrier} · <span dir="ltr">{selected.waybillTracking}</span>
                </p>
              ) : null}
            </div>
          ) : null}

          {access?.canInspect ? (
            <form
              className="space-y-2 rounded-2xl bg-white p-4 shadow ring-1 ring-[#14213D]/10"
              onSubmit={async (event) => {
                event.preventDefault();
                const ok = await post(
                  {
                    action: "intake",
                    ...form,
                    centerId: form.centerId || access.centerId || undefined,
                  },
                  "اتسجل الاستقبال واتبعت إشعار لمدير المراكز.",
                );
                if (ok) setForm((prev) => ({ ...emptyForm(), name: prev.name, phone: prev.phone, address: prev.address, centerId: prev.centerId }));
              }}
            >
              <h2 className="font-extrabold text-[#14213D]">تكت استقبال جديد</h2>
              {form.wooOrderNumber ? (
                <p className="text-xs font-bold text-emerald-800">مربوط بأوردر #{form.wooOrderNumber}{form.confirmationId ? ` · تأكيد ${form.confirmationId}` : ""}</p>
              ) : null}
              <input className={FIELD} placeholder="اسم العميل" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className={FIELD} dir="ltr" placeholder="رقم الموبايل" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <textarea className={`${FIELD} h-16 py-2`} placeholder="العنوان" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              {access.isManager ? (
                <select className={FIELD} value={form.centerId} onChange={(e) => setForm({ ...form, centerId: e.target.value ? Number(e.target.value) : "" })}>
                  <option value="">المركز</option>
                  {centers.map((center) => (
                    <option key={center.id} value={center.id}>
                      {center.name}
                    </option>
                  ))}
                </select>
              ) : null}
              <div className="relative">
                <input
                  className={FIELD}
                  placeholder="بحث منتج سوكاني"
                  value={form.productName}
                  onChange={(e) => setForm({ ...form, productName: e.target.value, wooProductId: null, productCode: "" })}
                />
                {hits.length ? (
                  <ul className="absolute z-10 mt-1 w-full rounded-xl bg-white shadow ring-1 ring-[#14213D]/10">
                    {hits.map((hit) => (
                      <li key={hit.id}>
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-right text-sm font-bold hover:bg-[#F5F5F0]"
                          onClick={() => {
                            setForm({ ...form, wooProductId: hit.id, productName: hit.name, productCode: hit.displayCode || hit.sku });
                            setHits([]);
                          }}
                        >
                          {hit.name} · {hit.displayCode || hit.sku}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <select className={FIELD} value={form.purchaseSource} onChange={(e) => setForm({ ...form, purchaseSource: e.target.value })}>
                <option value="">من أين اشترى</option>
                {sources.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </select>
              <input className={FIELD} placeholder="تفاصيل مكان الشراء (اختياري)" value={form.purchaseSourceNote} onChange={(e) => setForm({ ...form, purchaseSourceNote: e.target.value })} />
              <label className="block text-xs font-bold">
                تاريخ استلام العميل للمنتج
                <input className={`${FIELD} mt-1`} type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
              </label>
              <div className="flex flex-wrap gap-3 text-xs font-bold">
                <label>
                  <input type="radio" name="usage" className="ml-1 accent-[#FCA311]" checked={form.usageKind === "new"} onChange={() => setForm({ ...form, usageKind: "new" })} />
                  جديد
                </label>
                <label>
                  <input type="radio" name="usage" className="ml-1 accent-[#FCA311]" checked={form.usageKind === "used"} onChange={() => setForm({ ...form, usageKind: "used" })} />
                  مستخدم
                </label>
                <label>
                  <input type="radio" name="visual" className="ml-1 accent-[#FCA311]" checked={form.visualKind === "intact"} onChange={() => setForm({ ...form, visualKind: "intact" })} />
                  سليم ظاهريًا
                </label>
                <label>
                  <input type="radio" name="visual" className="ml-1 accent-[#FCA311]" checked={form.visualKind === "broken"} onChange={() => setForm({ ...form, visualKind: "broken" })} />
                  به كسر
                </label>
                <label>
                  <input type="checkbox" className="ml-1 size-4 accent-[#FCA311]" checked={form.powerCut} onChange={(e) => setForm({ ...form, powerCut: e.target.checked })} />
                  فاصل باور
                </label>
              </div>
              <div className="flex flex-wrap gap-3 text-xs font-bold">
                {defects.map((item) => (
                  <label key={item.id}>
                    <input
                      type="checkbox"
                      className="ml-1 size-4 accent-[#FCA311]"
                      checked={form.defects.includes(item.id)}
                      onChange={() =>
                        setForm({
                          ...form,
                          defects: form.defects.includes(item.id) ? form.defects.filter((id) => id !== item.id) : [...form.defects, item.id],
                        })
                      }
                    />
                    {item.label}
                  </label>
                ))}
              </div>
              <input className={FIELD} placeholder="عيب صناعة آخر" value={form.defectOther} onChange={(e) => setForm({ ...form, defectOther: e.target.value })} />
              <textarea className={`${FIELD} h-20 py-2`} placeholder="شكوى العميل" value={form.complaintNote} onChange={(e) => setForm({ ...form, complaintNote: e.target.value })} />
              <textarea className={`${FIELD} h-16 py-2`} placeholder="طلب العميل" value={form.customerRequest} onChange={(e) => setForm({ ...form, customerRequest: e.target.value })} />
              <textarea className={`${FIELD} h-16 py-2`} placeholder="اقتراح موظف الاستقبال لحل المشكلة" value={form.staffProposal} onChange={(e) => setForm({ ...form, staffProposal: e.target.value })} />
              <label className="block text-xs font-bold">
                صورة الفاتورة
                <input type="file" accept="image/*" capture="environment" className="mt-1 block w-full text-xs" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload("invoice", file); }} />
              </label>
              <label className="block text-xs font-bold">
                صور المنتج
                <input type="file" accept="image/*" capture="environment" className="mt-1 block w-full text-xs" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload("product", file); }} />
              </label>
              <label className="block text-xs font-bold">
                صور الشكوى (من واتساب أو الموبايل)
                <input type="file" accept="image/*" className="mt-1 block w-full text-xs" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload("complaint", file); }} />
              </label>
              {uploading ? <p className="text-xs font-bold">جاري رفع الصورة...</p> : null}
              <div className="flex flex-wrap gap-2">
                {form.invoiceUrls.concat(form.productUrls, form.complaintUrls).map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={url} src={url} alt="" className="h-14 w-14 rounded-lg object-cover" />
                ))}
              </div>
              <button disabled={loading} className="h-10 rounded-xl bg-[#FCA311] px-4 text-sm font-extrabold text-black disabled:opacity-60">
                تسجيل الاستقبال
              </button>
            </form>
          ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
