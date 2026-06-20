import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

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
  providers: [
    CredentialsProvider({
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
          };
        }

        return null;
      },
    }),
  ],
};

