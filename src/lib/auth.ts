import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { authenticateDriver } from "@/lib/dispatch/drivers";

const adminEmail = process.env.ADMIN_EMAIL || "admin@sokany-eg.com";
const adminPassword = process.env.ADMIN_PASSWORD || "admin123456";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET || "sokany-local-dev-secret-change-before-production",
  pages: {
    signIn: "/admin/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.driverId = user.driverId;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub || session.user.id;
        session.user.role = (token.role as "admin" | "driver") || "admin";
        session.user.driverId = token.driverId as number | undefined;
      }

      return session;
    },
  },
  providers: [
    CredentialsProvider({
      id: "admin-credentials",
      name: "Admin credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        if (credentials.email === adminEmail && credentials.password === adminPassword) {
          return {
            id: "sokany-admin",
            email: adminEmail,
            name: "SOKANY Admin",
            role: "admin" as const,
          };
        }

        return null;
      },
    }),
    CredentialsProvider({
      id: "driver-credentials",
      name: "Driver credentials",
      credentials: {
        phone: { label: "Phone", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.phone || !credentials?.password) {
          return null;
        }

        const driver = await authenticateDriver(credentials.phone, credentials.password);

        if (!driver) {
          return null;
        }

        return {
          id: `driver-${driver.id}`,
          email: driver.email || undefined,
          name: driver.name,
          role: "driver" as const,
          driverId: driver.id,
        };
      },
    }),
  ],
};
