import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

import type { WooOrder } from "./orders";
import { mapOrder, type AdminOrder } from "./orders";

const siteUrl = process.env.WOOCOMMERCE_STORE_URL || "https://sokany-eg.com";
const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;
const sessionSecret = process.env.NEXTAUTH_SECRET || "sokany-local-dev-secret-change-before-production";
const customerSessionCookie = "sokany_customer_session";

type WooCustomer = {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  billing?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  };
};

export type CustomerSession = {
  customerId: number;
  email: string;
  name: string;
  phone: string;
};

export type LoyaltySummary = {
  completedOrdersTotal: number;
  points: number;
  discountValue: number;
};

function hasWooCredentials() {
  return Boolean(siteUrl && consumerKey && consumerSecret);
}

type JwtAuthResponse = {
  token?: string;
  user_email?: string;
  user_id?: number;
  user_display_name?: string;
  user_nicename?: string;
};

function mapWooCustomerToSession(customer: WooCustomer): CustomerSession {
  return {
    customerId: customer.id,
    email: customer.email,
    name:
      `${customer.first_name || customer.billing?.first_name || ""} ${customer.last_name || customer.billing?.last_name || ""}`.trim() ||
      customer.username ||
      customer.email,
    phone: customer.billing?.phone || "",
  };
}

function extractUserIdFromJwtToken(token: string): number | null {
  try {
    const parts = token.split(".");

    if (parts.length < 2) {
      return null;
    }

    const segment = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = segment + "=".repeat((4 - (segment.length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;
    const data = payload.data;

    if (data && typeof data === "object" && !Array.isArray(data)) {
      const user = (data as Record<string, unknown>).user;

      if (user && typeof user === "object" && !Array.isArray(user)) {
        const id = Number((user as Record<string, unknown>).id);

        if (id > 0) {
          return id;
        }
      }
    }

    const directId = Number(payload.user_id ?? payload.id);

    return directId > 0 ? directId : null;
  } catch {
    return null;
  }
}

function resolveJwtUserId(payload: JwtAuthResponse): number {
  return Number(payload.user_id) || extractUserIdFromJwtToken(payload.token || "") || 0;
}

function buildSessionFromJwt(payload: JwtAuthResponse, username: string, userId: number): CustomerSession | null {
  if (!userId) {
    return null;
  }

  return {
    customerId: userId,
    email: payload.user_email || "",
    name: payload.user_display_name || payload.user_nicename || username,
    phone: "",
  };
}

async function wooFetchOptional<T>(path: string): Promise<T | null> {
  if (!hasWooCredentials()) {
    return null;
  }

  const url = new URL(`/wp-json/wc/v3/${path}`, siteUrl);
  const authToken = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Authorization: `Basic ${authToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
}

async function wooFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!hasWooCredentials()) {
    return null;
  }

  const url = new URL(`/wp-json/wc/v3/${path}`, siteUrl);
  const authToken = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Basic ${authToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `WooCommerce request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function signPayload(payload: string) {
  return createHmac("sha256", sessionSecret).update(payload).digest("base64url");
}

function createSessionToken(session: CustomerSession) {
  const payload = base64Url(JSON.stringify(session));
  const signature = signPayload(payload);

  return `${payload}.${signature}`;
}

function verifySessionToken(token?: string) {
  if (!token) {
    return null;
  }

  const [payload, signature] = token.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as CustomerSession;
  } catch {
    return null;
  }
}

export async function setCustomerSession(session: CustomerSession) {
  const cookieStore = await cookies();
  cookieStore.set(customerSessionCookie, createSessionToken(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearCustomerSession() {
  const cookieStore = await cookies();
  cookieStore.delete(customerSessionCookie);
}

export async function getCustomerSession() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(customerSessionCookie)?.value);
}

function splitName(name: string) {
  const [firstName, ...lastNameParts] = name.trim().split(/\s+/);

  return {
    firstName: firstName || name,
    lastName: lastNameParts.join(" "),
  };
}

export async function createCustomerAccount(input: {
  name: string;
  email: string;
  phone: string;
  password: string;
}) {
  const { firstName, lastName } = splitName(input.name);
  const customer = await wooFetch<WooCustomer>("customers", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      username: input.email,
      password: input.password,
      first_name: firstName,
      last_name: lastName,
      billing: {
        first_name: firstName,
        last_name: lastName,
        email: input.email,
        phone: input.phone,
      },
    }),
  });

  if (!customer) {
    throw new Error("تعذر إنشاء حساب العميل في ووردبريس.");
  }

  return {
    customerId: customer.id,
    email: customer.email,
    name: `${customer.first_name || firstName} ${customer.last_name || lastName}`.trim(),
    phone: customer.billing?.phone || input.phone,
  } satisfies CustomerSession;
}

export async function findCustomerByEmail(email: string) {
  if (!email.includes("@")) {
    return null;
  }

  const customers = await wooFetch<WooCustomer[]>(`customers?email=${encodeURIComponent(email)}`);
  const customer = customers?.[0];

  if (!customer) {
    return null;
  }

  return mapWooCustomerToSession(customer);
}

export async function findCustomerById(userId: number) {
  const customer = await wooFetchOptional<WooCustomer>(`customers/${userId}`);

  if (!customer) {
    return null;
  }

  return mapWooCustomerToSession(customer);
}

export async function loginCustomerWithWordPress(input: { username: string; password: string }) {
  const tokenUrl = new URL("/wp-json/jwt-auth/v1/token", siteUrl);
  const response = await fetch(tokenUrl, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: input.username,
      password: input.password,
    }),
  });

  if (!response.ok) {
    throw new Error("تعذر تسجيل الدخول. تأكد من بيانات الحساب أو تفعيل JWT في ووردبريس.");
  }

  const payload = (await response.json()) as JwtAuthResponse;
  const userId = resolveJwtUserId(payload);

  if (payload.user_email) {
    const customerByEmail = await findCustomerByEmail(payload.user_email).catch(() => null);

    if (customerByEmail) {
      return customerByEmail;
    }
  }

  if (userId) {
    const customerById = await findCustomerById(userId);

    if (customerById) {
      return customerById;
    }

    const sessionFromJwt = buildSessionFromJwt(payload, input.username, userId);

    if (sessionFromJwt) {
      return sessionFromJwt;
    }
  }

  throw new Error("تم تسجيل الدخول في ووردبريس لكن لم يتم العثور على عميل ووكومرس مطابق.");
}

export async function getCustomerOrders(customerId: number) {
  const orders = await wooFetch<WooOrder[]>(`orders?customer=${customerId}&per_page=100&orderby=date&order=desc`).catch(() => []);

  return (orders || []).map((order) => mapOrder(order));
}

export function getActiveOrder(orders: AdminOrder[]) {
  return orders.find((order) => !["completed", "cancelled", "refunded", "failed"].includes(order.status)) || orders[0] || null;
}

export function getOrderTimeline(order?: AdminOrder | null) {
  const status = order?.status || "";
  const steps = [
    { id: "received", label: "تم استلام الطلب", activeStatuses: ["pending", "processing", "completed"] },
    { id: "processing", label: "جاري التجهيز", activeStatuses: ["processing", "completed"] },
    { id: "packed", label: "تم التغليف", activeStatuses: ["packed", "shipped", "completed"] },
    { id: "shipped", label: "تم الشحن", activeStatuses: ["shipped", "completed"] },
    { id: "completed", label: "تم التسليم", activeStatuses: ["completed"] },
  ];

  return steps.map((step) => ({
    ...step,
    isActive: step.activeStatuses.includes(status),
  }));
}

export function calculateLoyaltySummary(orders: AdminOrder[]): LoyaltySummary {
  const completedOrdersTotal = orders
    .filter((order) => order.status === "completed")
    .reduce((total, order) => total + Number(order.total || 0), 0);
  const points = Math.floor(completedOrdersTotal / 10);

  return {
    completedOrdersTotal,
    points,
    discountValue: points * 0.5,
  };
}
