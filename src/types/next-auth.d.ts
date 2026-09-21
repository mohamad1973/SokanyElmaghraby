import type { DefaultSession } from "next-auth";

export type UserRole = "admin" | "driver" | "cs";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: UserRole;
      driverId?: number;
      csAgentId?: number;
    };
  }

  interface User {
    role: UserRole;
    driverId?: number;
    csAgentId?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
    driverId?: number;
    csAgentId?: number;
  }
}
