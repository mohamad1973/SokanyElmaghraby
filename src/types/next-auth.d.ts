import type { DefaultSession } from "next-auth";

export type UserRole = "admin" | "driver" | "cs";
export type CsAgentRole = "agent" | "supervisor" | "admin" | "transfers";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: UserRole;
      driverId?: number;
      csAgentId?: number;
      csIsSupervisor?: boolean;
      csRole?: CsAgentRole;
      csIsAdmin?: boolean;
      csIsTransfers?: boolean;
      csCanAccessTransfers?: boolean;
    };
  }

  interface User {
    role: UserRole;
    driverId?: number;
    csAgentId?: number;
    csIsSupervisor?: boolean;
    csRole?: CsAgentRole;
    csIsAdmin?: boolean;
    csIsTransfers?: boolean;
    csCanAccessTransfers?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
    driverId?: number;
    csAgentId?: number;
    csIsSupervisor?: boolean;
    csRole?: CsAgentRole;
    csIsAdmin?: boolean;
    csIsTransfers?: boolean;
    csCanAccessTransfers?: boolean;
  }
}
