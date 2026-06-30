import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const secret = process.env.NEXTAUTH_SECRET || "sokany-local-dev-secret-change-before-production";

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const token = await getToken({ req, secret });
  const role = token?.role as "admin" | "driver" | undefined;

  if (pathname === "/admin/login" || pathname === "/driver/login") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/driver") || pathname.startsWith("/api/driver")) {
    if (!token) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      }

      return NextResponse.redirect(new URL("/driver/login", req.url));
    }

    if (role !== "driver") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      }

      return NextResponse.redirect(new URL("/driver/login", req.url));
    }

    return NextResponse.next();
  }

  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    if (!token) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      }

      return NextResponse.redirect(new URL("/admin/login", req.url));
    }

    if (role && role !== "admin") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      }

      return NextResponse.redirect(new URL("/driver/today", req.url));
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/driver/:path*", "/api/driver/:path*"],
};
