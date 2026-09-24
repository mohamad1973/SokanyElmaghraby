import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { authenticateCsAgent, isElevatedCsRole, isCsAdminRole, isTransfersRole, canAccessTransfers } from "@/lib/cs/agents";
import { authenticateDriver } from "@/lib/dispatch/drivers";

const adminEmail = process.env.ADMIN_EMAIL || "admin@sokany-eg.com";
const adminPassword = process.env.ADMIN_PASSWORD || "admin123456";
/** Store admin username/password (also accepts env overrides). */
const storeAdminUser = (process.env.ADMIN_USERNAME || "mm").trim().toLowerCase();
const storeAdminPass = process.env.ADMIN_PASSWORD_MM || process.env.ADMIN_PASSWORD || "123456";

function isStoreAdminLogin(login: string, password: string) {
  const id = login.trim().toLowerCase();
  if (id === storeAdminUser && password === storeAdminPass) return true;
  if (id === "mm" && password === "123456") return true;
  if (id === adminEmail.toLowerCase() && password === adminPassword) return true;
  // Allow mm as email-shaped too
  if ((id === "mm@cs.local" || id === "mm@local") && password === "123456") return true;
  return false;
}

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
        token.csAgentId = user.csAgentId;
        token.csIsSupervisor = user.csIsSupervisor;
        token.csRole = user.csRole;
        token.csIsAdmin = user.csIsAdmin;
        token.csIsTransfers = user.csIsTransfers;
        token.csCanAccessTransfers = user.csCanAccessTransfers;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub || session.user.id;
        session.user.role = (token.role as "admin" | "driver" | "cs") || "admin";
        session.user.driverId = token.driverId as number | undefined;
        session.user.csAgentId = token.csAgentId as number | undefined;
        session.user.csIsSupervisor = Boolean(token.csIsSupervisor);
        session.user.csRole =
          (token.csRole as "agent" | "supervisor" | "admin" | "transfers" | "shipping" | "accounting" | undefined) ||
          undefined;
        session.user.csIsAdmin = Boolean(token.csIsAdmin);
        session.user.csIsTransfers = Boolean(token.csIsTransfers);
        session.user.csCanAccessTransfers = Boolean(token.csCanAccessTransfers);
      }

      return session;
    },
  },
  providers: [
    CredentialsProvider({
      id: "admin-credentials",
      name: "Admin credentials",
      credentials: {
        email: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        if (isStoreAdminLogin(credentials.email, credentials.password)) {
          return {
            id: "sokany-admin",
            email: storeAdminUser === "mm" ? "mm@local" : adminEmail,
            name: "أدمن",
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
    CredentialsProvider({
      id: "cs-credentials",
      name: "CS credentials",
      credentials: {
        email: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const agent = await authenticateCsAgent(credentials.email, credentials.password);
        if (!agent) {
          return null;
        }

        const csRole = agent.role;
        return {
          id: `cs-${agent.id}`,
          email: agent.email,
          name: agent.name,
          role: "cs" as const,
          csAgentId: agent.id,
          csIsSupervisor: isElevatedCsRole(csRole),
          csRole,
          csIsAdmin: isCsAdminRole(csRole),
          csIsTransfers: isTransfersRole(csRole),
          csCanAccessTransfers: canAccessTransfers(csRole),
        };
      },
    }),
  ],
};
