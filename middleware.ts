import { getToken } from "next-auth/jwt";
import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";

import { getLocaleFromPathname, stripLocalePrefix, withLocalePrefix } from "./src/i18n/path";
import { routing, type AppLocale } from "./src/i18n/routing";

const secret = process.env.NEXTAUTH_SECRET || "sokany-local-dev-secret-change-before-production";
const intlMiddleware = createMiddleware(routing);
const LOCALE_COOKIE = "NEXT_LOCALE";
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type SiteLocaleMode = "bilingual" | "ar-only";

function isDriverPath(pathname: string) {
  return pathname.startsWith("/driver") || pathname.startsWith("/api/driver");
}

function isAdminApiPath(pathname: string) {
  return pathname.startsWith("/api/admin");
}

function applyLocaleCookie(response: NextResponse, locale: AppLocale) {
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
  response.headers.set("x-locale", locale);
  return response;
}

function nextWithLocale(req: NextRequest, locale: AppLocale) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-locale", locale);
  return applyLocaleCookie(NextResponse.next({ request: { headers: requestHeaders } }), locale);
}

async function getSiteLocaleMode(req: NextRequest): Promise<SiteLocaleMode> {
  try {
    const url = new URL("/api/public/locale-mode", req.nextUrl.origin);
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(800),
      next: { revalidate: 30 },
    });

    if (!response.ok) {
      return "bilingual";
    }

    const data = (await response.json()) as { mode?: string };
    return data.mode === "ar-only" ? "ar-only" : "bilingual";
  } catch {
    return "bilingual";
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/") && !isAdminApiPath(pathname) && !pathname.startsWith("/api/driver")) {
    return nextWithLocale(req, "ar");
  }

  if (isDriverPath(pathname)) {
    if (pathname === "/driver/login") {
      return nextWithLocale(req, "ar");
    }

    const token = await getToken({ req, secret });
    const role = token?.role as "admin" | "driver" | undefined;

    if (!token || role !== "driver") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      }

      return NextResponse.redirect(new URL("/driver/login", req.url));
    }

    return nextWithLocale(req, "ar");
  }

  if (isAdminApiPath(pathname)) {
    const token = await getToken({ req, secret });
    const role = token?.role as "admin" | "driver" | undefined;

    if (!token) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (role && role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    return nextWithLocale(req, "ar");
  }

  const pathWithoutLocale = stripLocalePrefix(pathname);
  const urlLocale = getLocaleFromPathname(pathname);
  const cookieLocale = req.cookies.get(LOCALE_COOKIE)?.value as AppLocale | undefined;
  const preferredLocale =
    cookieLocale && (routing.locales as readonly string[]).includes(cookieLocale)
      ? cookieLocale
      : routing.defaultLocale;
  const isStorefrontPath = !pathWithoutLocale.startsWith("/admin");

  // Storefront Arabic-only mode: strip /en and ignore EN cookie preference.
  if (isStorefrontPath && (urlLocale === "en" || preferredLocale === "en")) {
    const localeMode = await getSiteLocaleMode(req);

    if (localeMode === "ar-only") {
      if (urlLocale === "en") {
        const url = req.nextUrl.clone();
        url.pathname = withLocalePrefix(pathWithoutLocale, "ar");
        return applyLocaleCookie(NextResponse.redirect(url), "ar");
      }
      // Prefer EN cookie on an Arabic URL: stay Arabic and clear EN below.
    } else if (
      preferredLocale === "en" &&
      urlLocale === routing.defaultLocale &&
      !pathWithoutLocale.startsWith("/api")
    ) {
      const url = req.nextUrl.clone();
      url.pathname = withLocalePrefix(pathWithoutLocale, "en");
      return applyLocaleCookie(NextResponse.redirect(url), "en");
    }
  } else if (
    preferredLocale === "en" &&
    urlLocale === routing.defaultLocale &&
    !pathWithoutLocale.startsWith("/api")
  ) {
    // Admin (and any non-storefront) keeps bilingual cookie preference.
    const url = req.nextUrl.clone();
    url.pathname = withLocalePrefix(pathWithoutLocale, "en");
    return applyLocaleCookie(NextResponse.redirect(url), "en");
  }

  if (pathWithoutLocale === "/admin/login" || pathWithoutLocale.startsWith("/admin/login/")) {
    return applyLocaleCookie(intlMiddleware(req), urlLocale);
  }

  if (pathWithoutLocale.startsWith("/admin")) {
    const token = await getToken({ req, secret });
    const role = token?.role as "admin" | "driver" | undefined;
    const loginPath = withLocalePrefix("/admin/login", urlLocale);

    if (!token) {
      return applyLocaleCookie(NextResponse.redirect(new URL(loginPath, req.url)), urlLocale);
    }

    if (role && role !== "admin") {
      return NextResponse.redirect(new URL("/driver/today", req.url));
    }
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-locale", urlLocale);
  const localizedRequest = new NextRequest(req.url, {
    headers: requestHeaders,
    method: req.method,
  });

  // When storefront is ar-only and cookie was en but path is already ar, force ar cookie.
  const responseLocale =
    isStorefrontPath && preferredLocale === "en" && urlLocale === "ar" ? "ar" : urlLocale;

  return applyLocaleCookie(intlMiddleware(localizedRequest), responseLocale);
}

export const config = {
  matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
