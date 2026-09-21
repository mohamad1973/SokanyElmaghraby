import type { DefaultSession } from "next-auth";

export type UserRole = "admin" | "driver" | "cs";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: UserRole;
      driverId?: number;
      csAgentId?: number;
      csIsSupervisor?: boolean;
    };
  }

  interface User {
    role: UserRole;
    driverId?: number;
    csAgentId?: number;
    csIsSupervisor?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
    driverId?: number;
    csAgentId?: number;
    csIsSupervisor?: boolean;
  }
}
