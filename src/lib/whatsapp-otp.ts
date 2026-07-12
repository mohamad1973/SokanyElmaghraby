import "server-only";

import { normalizeWhatsAppPhone } from "./whatsapp-link";

const siteUrl = process.env.WOOCOMMERCE_STORE_URL || "https://sokany-eg.com";

export type OtpPurpose = "login" | "reset_password" | "register";

type OtpRequestResponse = {
  ok?: boolean;
  status?: string;
  message?: string;
  purpose?: string;
  expiresInMinutes?: number;
  testMode?: boolean;
};

type OtpVerifyResponse = {
  ok?: boolean;
  status?: string;
  token?: string;
  message?: string;
};

type OtpLoginResponse = {
  ok?: boolean;
  status?: string;
  userId?: number;
  email?: string;
  name?: string;
  phone?: string;
  message?: string;
};

type OtpResetPasswordResponse = {
  ok?: boolean;
  status?: string;
  message?: string;
};

type OtpChangePasswordResponse = {
  ok?: boolean;
  status?: string;
  message?: string;
};

function getOtpEndpoint(path: string) {
  const base = siteUrl.replace(/\/+$/, "");

  return `${base}/wp-json/sokany-otp/v1/${path}`;
}

function normalizeOtpPhone(phone: string) {
  return normalizeWhatsAppPhone(phone);
}

async function parseOtpResponse<T extends { message?: string }>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as (T & { code?: string; message?: string }) | null;

  if (!response.ok) {
    throw new Error(payload?.message || "تعذر إكمال طلب التحقق.");
  }

  if (!payload) {
    throw new Error("استجابة غير صالحة من خادم التحقق.");
  }

  return payload;
}

export async function requestOtp(phone: string, purpose: OtpPurpose) {
  const normalizedPhone = normalizeOtpPhone(phone);

  if (!normalizedPhone) {
    throw new Error("رقم الموبايل غير صحيح.");
  }

  const response = await fetch(getOtpEndpoint("request"), {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      phone: normalizedPhone,
      purpose,
    }),
  });

  const payload = await parseOtpResponse<OtpRequestResponse>(response);

  if (!payload.ok) {
    return {
      ok: false as const,
      status: payload.status || "request_failed",
      message: payload.message || "تعذر إرسال كود التحقق.",
    };
  }

  return {
    ok: true as const,
    status: payload.status || "otp_sent",
    purpose: payload.purpose || purpose,
    expiresInMinutes: payload.expiresInMinutes || 5,
    testMode: Boolean(payload.testMode),
    phone: normalizedPhone,
  };
}

export async function verifyOtp(phone: string, otp: string, purpose: OtpPurpose) {
  const normalizedPhone = normalizeOtpPhone(phone);

  if (!normalizedPhone) {
    throw new Error("رقم الموبايل غير صحيح.");
  }

  const response = await fetch(getOtpEndpoint("verify"), {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      phone: normalizedPhone,
      purpose,
      otp,
    }),
  });

  const payload = await parseOtpResponse<OtpVerifyResponse>(response);

  if (!payload.ok || !payload.token) {
    throw new Error("تعذر التحقق من الكود.");
  }

  return {
    token: payload.token,
    phone: normalizedPhone,
    purpose,
  };
}

export async function completeOtpLogin(phone: string, token: string) {
  const normalizedPhone = normalizeOtpPhone(phone);

  if (!normalizedPhone) {
    throw new Error("رقم الموبايل غير صحيح.");
  }

  const response = await fetch(getOtpEndpoint("login"), {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      phone: normalizedPhone,
      token,
    }),
  });

  const payload = await parseOtpResponse<OtpLoginResponse>(response);

  if (!payload.ok || !payload.userId) {
    throw new Error("تعذر إكمال تسجيل الدخول.");
  }

  return {
    customerId: payload.userId,
    email: payload.email || "",
    name: payload.name || "",
    phone: payload.phone || normalizedPhone,
  };
}

export async function resetPasswordWithOtp(phone: string, token: string, password: string) {
  const normalizedPhone = normalizeOtpPhone(phone);

  if (!normalizedPhone) {
    throw new Error("رقم الموبايل غير صحيح.");
  }

  const response = await fetch(getOtpEndpoint("reset-password"), {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      phone: normalizedPhone,
      token,
      password,
    }),
  });

  await parseOtpResponse<OtpResetPasswordResponse>(response);
}

export async function changePasswordWithCurrent(email: string, currentPassword: string, newPassword: string) {
  const response = await fetch(getOtpEndpoint("change-password"), {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      currentPassword,
      newPassword,
    }),
  });

  await parseOtpResponse<OtpChangePasswordResponse>(response);
}
