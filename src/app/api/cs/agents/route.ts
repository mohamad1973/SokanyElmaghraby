import { NextResponse } from "next/server";

import {
  CS_ROLES,
  createCsAgent,
  deleteCsAgentByAdmin,
  ensureCsTables,
  listCsAgents,
  type CsRole,
  updateCsAgentByAdmin,
} from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { requireCsSession } from "@/lib/session-guards";

async function requireCsAdmin() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) return null;
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.isAdmin && !session.user.csIsAdmin) return null;
  return session;
}

export async function GET() {
  const session = await requireCsAdmin();
  if (!session) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  await ensureCsTables();
  const agents = await listCsAgents();
  return NextResponse.json({
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      username: a.username,
      role: a.role,
      phone: (a as { phone?: string | null }).phone || null,
      isActive: a.isActive,
      createdAt: a.createdAt,
    })),
  });
}

export async function POST(request: Request) {
  const session = await requireCsAdmin();
  if (!session) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });

  let body: {
    name?: string;
    username?: string;
    password?: string;
    role?: string;
    phone?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: "طلب غير صالح." }, { status: 400 });
  }

  const role = (body.role || "agent") as CsRole;
  if (!CS_ROLES.includes(role) || role === "admin") {
    return NextResponse.json({ message: "دور غير صالح." }, { status: 400 });
  }

  const result = await createCsAgent({
    name: String(body.name || ""),
    username: String(body.username || ""),
    password: String(body.password || ""),
    role,
    phone: body.phone,
  });
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
  return NextResponse.json({ ok: true, agent: result.agent });
}

export async function PATCH(request: Request) {
  const session = await requireCsAdmin();
  if (!session) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });

  let body: {
    id?: number;
    role?: string;
    isActive?: boolean;
    name?: string;
    password?: string;
    phone?: string | null;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: "طلب غير صالح." }, { status: 400 });
  }

  const id = Number(body.id);
  if (!id) return NextResponse.json({ message: "معرّف مطلوب." }, { status: 400 });

  const role = body.role as CsRole | undefined;
  if (role && !CS_ROLES.includes(role)) {
    return NextResponse.json({ message: "دور غير صالح." }, { status: 400 });
  }

  const result = await updateCsAgentByAdmin({
    id,
    role,
    isActive: body.isActive,
    name: body.name,
    password: body.password,
    phone: body.phone,
  });
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
  return NextResponse.json({ ok: true, agent: result.agent });
}

export async function DELETE(request: Request) {
  const session = await requireCsAdmin();
  if (!session) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id"));
  if (!id) return NextResponse.json({ message: "معرّف مطلوب." }, { status: 400 });

  const result = await deleteCsAgentByAdmin(id);
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
