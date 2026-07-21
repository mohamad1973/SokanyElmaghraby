"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { Link, useRouter } from "@/i18n/navigation";
import { cartLineTotal, formatCartMoney, getMaxOrderQuantity } from "@/lib/cart";

import { useCart } from "./cart-provider";
import { VisualEditableText } from "./visual-editable-text";

const CHECKOUT_ADDRESS_KEY = "sokany-checkout-address";

type CityOption = { id: string; nameAr: string; nameEn: string };
type DistrictOption = { id: string; nameAr: string; nameEn: string; cityId: string };
type PaymentMethod = "fawry" | "cod";

type MeCustomer = {
  name?: string;
  phone?: string;
  email?: string;
};

type SavedCheckoutAddress = {
  name?: string;
  phone?: string;
  cityId?: string;
  governorate?: string;
  area?: string;
  address?: string;
  note?: string;
};

function readSavedAddress(): SavedCheckoutAddress | null {
  try {
    const raw = window.localStorage.getItem(CHECKOUT_ADDRESS_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as SavedCheckoutAddress;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeSavedAddress(payload: SavedCheckoutAddress) {
  try {
    window.localStorage.setItem(CHECKOUT_ADDRESS_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

export function CheckoutForm() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("checkout");
  const tCommon = useTranslations("common");
  const { items, clearCart, updateQty, removeItem } = useCart();
  const subtotal = useMemo(() => items.reduce((sum, item) => sum + cartLineTotal(item), 0), [items]);
  const cityLabel = (city: CityOption) => (locale === "en" ? city.nameEn || city.nameAr : city.nameAr);
  const districtLabel = (district: DistrictOption) =>
    locale === "en" ? district.nameEn || district.nameAr : district.nameAr;

  const [authChecked, setAuthChecked] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [cityId, setCityId] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cod");
  const pendingAreaRef = useRef<string | null>(null);
  const [addressHydrated, setAddressHydrated] = useState(false);

  const [cities, setCities] = useState<CityOption[]>([]);
  const [districts, setDistricts] = useState<DistrictOption[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(true);
  const [districtsLoading, setDistrictsLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/account/me", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace("/account/login?next=/checkout");
          return;
        }

        const data = (await response.json().catch(() => null)) as { customer?: MeCustomer } | null;
        if (cancelled) {
          return;
        }

        const customer = data?.customer;
        if (customer) {
          setName((current) => current || customer.name || "");
          setPhone((current) => current || customer.phone || "");
          setEmail((current) => current || customer.email || "");
        }

        setAuthChecked(true);
      })
      .catch(() => {
        if (!cancelled) {
          router.replace("/account/login?next=/checkout");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    setCitiesLoading(true);
    fetch("/api/shipping/bosta/cities", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as {
          cities?: CityOption[];
          message?: string;
        } | null;

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setGeoError(data?.message || "تعذر تحميل المحافظات من بوسطة.");
          setCities([]);
          return;
        }

        setCities(data?.cities || []);
        setGeoError(null);
      })
      .catch(() => {
        if (!cancelled) {
          setGeoError("تعذر تحميل المحافظات من بوسطة.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCitiesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authChecked || citiesLoading || addressHydrated) {
      return;
    }

    const saved = readSavedAddress();
    if (!saved) {
      setAddressHydrated(true);
      return;
    }

    setName((current) => current || saved.name || "");
    setPhone((current) => current || saved.phone || "");
    if (saved.address) {
      setAddress(saved.address);
    }
    if (saved.note) {
      setNote(saved.note);
    }

    if (cities.length) {
      const match =
        cities.find((city) => city.id === saved.cityId) ||
        cities.find((city) => city.nameAr === saved.governorate);

      if (match) {
        pendingAreaRef.current = saved.area?.trim() || null;
        setCityId(match.id);
        setGovernorate(match.nameAr);
      } else if (saved.governorate) {
        setGovernorate(saved.governorate);
      }
    }

    setAddressHydrated(true);
  }, [authChecked, cities, citiesLoading, addressHydrated]);

  useEffect(() => {
    if (!cityId) {
      setDistricts([]);
      setArea("");
      return;
    }

    let cancelled = false;
    const restoreArea = pendingAreaRef.current;
    setDistrictsLoading(true);
    if (!restoreArea) {
      setArea("");
    }

    fetch(`/api/shipping/bosta/districts?cityId=${encodeURIComponent(cityId)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as {
          districts?: DistrictOption[];
          message?: string;
        } | null;

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setDistricts([]);
          setGeoError(data?.message || "تعذر تحميل المناطق.");
          return;
        }

        const nextDistricts = data?.districts || [];
        setDistricts(nextDistricts);
        setGeoError(null);

        if (restoreArea) {
          const match = nextDistricts.find((district) => district.nameAr === restoreArea);
          setArea(match ? match.nameAr : restoreArea);
          pendingAreaRef.current = null;
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDistricts([]);
          setGeoError("تعذر تحميل المناطق.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDistrictsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cityId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!items.length) {
      setError("السلة فارغة. أضف منتجات قبل إتمام الطلب.");
      return;
    }

    if (!name.trim() || !phone.trim() || !governorate.trim() || !area.trim() || !address.trim()) {
      setError("أكمل الاسم والهاتف والمحافظة والمنطقة والعنوان.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: {
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim() || undefined,
            governorate: governorate.trim(),
            area: area.trim(),
            address: address.trim(),
            note: note.trim() || undefined,
          },
          paymentMethod,
          items: items.map((item) => ({
            productId: item.id,
            quantity: item.qty,
            price: item.price,
          })),
        }),
      });

      const data = (await response.json().catch(() => null)) as {
        message?: string;
        redirectUrl?: string;
        ok?: boolean;
      } | null;

      if (response.status === 401 && data?.redirectUrl) {
        router.replace(data.redirectUrl);
        return;
      }

      if (!response.ok || !data?.ok || !data.redirectUrl) {
        setError(data?.message || "تعذر إتمام الطلب. حاول مرة أخرى.");
        return;
      }

      writeSavedAddress({
        name: name.trim(),
        phone: phone.trim(),
        cityId,
        governorate: governorate.trim(),
        area: area.trim(),
        address: address.trim(),
        note: note.trim(),
      });

      clearCart();

      if (data.redirectUrl.startsWith("http")) {
        window.location.href = data.redirectUrl;
        return;
      }

      router.push(data.redirectUrl);
    } catch {
      setError("تعذر الاتصال بالخادم. حاول مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!authChecked) {
    return (
      <div className="rounded-[2.5rem] bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-bold text-zinc-500">جاري التحقق من الحساب…</p>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-[2.5rem] bg-white p-8 text-center shadow-sm">
        <h1 className="inline-flex rounded-full bg-brand-gold px-6 py-3 text-2xl font-bold text-black sm:text-3xl">
          سلتك فارغة
        </h1>
        <p className="mx-auto mt-4 max-w-xl leading-8 text-zinc-600">أضف منتجات من المتجر ثم عد لإتمام الطلب.</p>
        <Link
          href="/shop"
          className="mt-8 inline-flex rounded-full bg-black px-7 py-3 text-sm font-bold text-white transition hover:bg-brand-gold hover:text-black"
        >
          {t("browseProducts")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_0.7fr] lg:px-8">
      <section className="rounded-[2.5rem] bg-white p-6 shadow-sm sm:p-8">
        <h1 className="inline-flex rounded-full bg-brand-gold px-6 py-3 text-2xl font-bold text-black sm:text-3xl">
          <VisualEditableText textKey="checkout.title">{t("title")}</VisualEditableText>
        </h1>
        <p className="mt-4 leading-8 text-zinc-600">{t("subtitle")}</p>

        <form className="mt-8 grid gap-5" onSubmit={onSubmit}>
          <label className="grid gap-2 text-sm font-bold text-zinc-700">
            <VisualEditableText textKey="checkout.field.name">{t("name")}</VisualEditableText>
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded-2xl border border-black/10 bg-brand-cream px-4 py-3 outline-none transition focus:border-brand-gold focus:bg-white"
              placeholder={t("name")}
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-zinc-700">
            <VisualEditableText textKey="checkout.field.phone">{t("phone")}</VisualEditableText>
            <input
              required
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="tel"
              className="rounded-2xl border border-black/10 bg-brand-cream px-4 py-3 outline-none transition focus:border-brand-gold focus:bg-white"
              placeholder="01xxxxxxxxx"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-zinc-700">
            <VisualEditableText textKey="checkout.field.governorate">{t("governorate")}</VisualEditableText>
            <select
              required
              value={cityId}
              disabled={citiesLoading || !cities.length}
              onChange={(event) => {
                const nextId = event.target.value;
                const selected = cities.find((city) => city.id === nextId);
                pendingAreaRef.current = null;
                setCityId(nextId);
                setGovernorate(selected ? cityLabel(selected) : "");
              }}
              className="rounded-2xl border border-black/10 bg-brand-cream px-4 py-3 outline-none transition focus:border-brand-gold focus:bg-white disabled:opacity-60"
            >
              <option value="">{citiesLoading ? tCommon("loading") : t("selectGovernorate")}</option>
              {cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {cityLabel(city)}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-bold text-zinc-700">
            <VisualEditableText textKey="checkout.field.area">{t("area")}</VisualEditableText>
            <select
              required
              value={area}
              disabled={!cityId || districtsLoading || !districts.length}
              onChange={(event) => setArea(event.target.value)}
              className="rounded-2xl border border-black/10 bg-brand-cream px-4 py-3 outline-none transition focus:border-brand-gold focus:bg-white disabled:opacity-60"
            >
              <option value="">
                {!cityId ? t("selectGovernorateFirst") : districtsLoading ? t("loadingAreas") : t("selectArea")}
              </option>
              {districts.map((district) => (
                <option key={district.id} value={district.nameAr}>
                  {districtLabel(district)}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-bold text-zinc-700">
            <VisualEditableText textKey="checkout.field.address">{t("address")}</VisualEditableText>
            <input
              required
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="rounded-2xl border border-black/10 bg-brand-cream px-4 py-3 outline-none transition focus:border-brand-gold focus:bg-white"
              placeholder={t("addressPlaceholder")}
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-zinc-700">
            <VisualEditableText textKey="checkout.field.note">{t("note")}</VisualEditableText>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              className="rounded-2xl border border-black/10 bg-brand-cream px-4 py-3 outline-none transition focus:border-brand-gold focus:bg-white"
              placeholder={t("note")}
            />
          </label>

          {geoError ? <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{geoError}</p> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label
              className={`rounded-2xl border p-4 ${paymentMethod === "fawry" ? "border-brand-gold bg-brand-cream" : "border-black/10 bg-white"}`}
            >
              <input
                type="radio"
                name="payment"
                className="ml-2"
                checked={paymentMethod === "fawry"}
                onChange={() => setPaymentMethod("fawry")}
              />
              <span className="font-bold">
                <VisualEditableText textKey="checkout.payment.fawry">{t("fawry")}</VisualEditableText>
              </span>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                <VisualEditableText textKey="checkout.payment.fawryDescription">{t("fawryDescription")}</VisualEditableText>
              </p>
            </label>
            <label
              className={`rounded-2xl border p-4 ${paymentMethod === "cod" ? "border-brand-gold bg-brand-cream" : "border-black/10 bg-white"}`}
            >
              <input
                type="radio"
                name="payment"
                className="ml-2"
                checked={paymentMethod === "cod"}
                onChange={() => setPaymentMethod("cod")}
              />
              <span className="font-bold">
                <VisualEditableText textKey="checkout.payment.cod">{t("cod")}</VisualEditableText>
              </span>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                <VisualEditableText textKey="checkout.payment.codDescription">{t("codDescription")}</VisualEditableText>
              </p>
            </label>
          </div>

          {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-brand-gold px-8 py-4 text-sm font-bold text-black transition hover:bg-brand-gold-dark disabled:opacity-60"
          >
            {submitting ? t("placingOrder") : (
              <VisualEditableText textKey="checkout.confirm">{t("placeOrder")}</VisualEditableText>
            )}
          </button>
        </form>
      </section>

      <aside className="h-fit rounded-[2.5rem] bg-zinc-950 p-6 text-white shadow-sm sm:p-8">
        <h2 className="text-2xl font-bold">
          <VisualEditableText textKey="checkout.summary.title">{t("orderSummary")}</VisualEditableText>
        </h2>

        <ul className="mt-6 space-y-4">
          {items.map((item) => {
            const maxQty = getMaxOrderQuantity(item);

            return (
              <li key={item.id} className="flex gap-3 border-b border-white/10 pb-4">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/5">
                  <Image src={item.image} alt={item.name} fill className="object-contain p-1" sizes="56px" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{item.name}</p>
                  <p className="mt-1 text-xs text-zinc-400">{item.price} ج.م</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-2 py-1" dir="ltr">
                      <button
                        type="button"
                        aria-label="تقليل الكمية"
                        disabled={item.qty <= 1}
                        onClick={() => updateQty(item.id, item.qty - 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-sm font-bold disabled:opacity-40"
                      >
                        −
                      </button>
                      <span className="min-w-5 text-center text-sm font-bold">{item.qty}</span>
                      <button
                        type="button"
                        aria-label="زيادة الكمية"
                        disabled={item.qty >= maxQty}
                        onClick={() => updateQty(item.id, item.qty + 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-sm font-bold disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="text-xs font-bold text-red-300 hover:underline"
                    >
                      حذف
                    </button>
                  </div>
                </div>
                <p className="shrink-0 text-sm font-bold text-brand-gold">{formatCartMoney(cartLineTotal(item))} ج.م</p>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 space-y-4 text-sm">
          <div className="flex justify-between border-b border-white/10 pb-4">
            <span className="text-zinc-300">
              <VisualEditableText textKey="checkout.summary.products">المنتجات</VisualEditableText>
            </span>
            <span className="font-bold">{formatCartMoney(subtotal)} ج.م</span>
          </div>
          <div className="flex justify-between border-b border-white/10 pb-4">
            <span className="text-zinc-300">
              <VisualEditableText textKey="checkout.summary.shipping">الشحن</VisualEditableText>
            </span>
            <span className="font-bold text-brand-gold">مجاني</span>
          </div>
          <div className="flex justify-between text-lg">
            <span className="text-zinc-300">
              <VisualEditableText textKey="checkout.summary.total">الإجمالي</VisualEditableText>
            </span>
            <span className="font-bold text-brand-gold">{formatCartMoney(subtotal)} ج.م</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
