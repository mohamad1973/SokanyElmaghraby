import type { DefaultSession } from "next-auth";

export type UserRole = "admin" | "driver";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: UserRole;
      driverId?: number;
    };
  }

  interface User {
    role: UserRole;
    driverId?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
    driverId?: number;
  }
}
