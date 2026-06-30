import "server-only";

import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

export async function requireAdminSession() {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== "admin") {
    return null;
  }

  return session;
}

export async function requireDriverSession() {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== "driver" || !session.user.driverId) {
    return null;
  }

  return session;
}
