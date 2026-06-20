import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/admin/login",
  },
  secret: process.env.NEXTAUTH_SECRET || "sokany-local-dev-secret-change-before-production",
  callbacks: {
    authorized({ req, token }) {
      if (req.nextUrl.pathname === "/admin/login") {
        return true;
      }

      return Boolean(token);
    },
  },
});

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};

