import { NextResponse } from "next/server";

import {
  SC_GOVERNORATES,
  SC_PERMISSION_CATALOG,
  deleteScCenter,
  deleteScEmployee,
  deleteScJob,
  loadScOrg,
  resolveScAccess,
  saveScCenter,
  saveScEmployee,
  saveScJob,
} from "@/lib/cs/sc-centers";
import { requireCsSession } from "@/lib/session-guards";

async function accessOf() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) return null;
  const access = await resolveScAccess(session.user.csAgentId);
  if (!access.canOpen) return null;
  return access;
}

export async function GET() {
  const access = await accessOf();
  if (!access) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  const org = await loadScOrg();
  return NextResponse.json({
    ok: true,
    access,
    catalog: SC_PERMISSION_CATALOG,
    governorates: SC_GOVERNORATES,
    ...org,
  });
}

export async function POST(request: Request) {
  const access = await accessOf();
  if (!access) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  let body: {
    resource?: "center" | "job" | "employee";
    id?: number;
    name?: string;
    address?: string;
    governorate?: string;
    phones?: string[];
    headcount?: number;
    title?: string;
    parentId?: number | null;
    sortOrder?: number;
    responsibilities?: string;
    permissions?: string[];
    centerId?: number;
    jobId?: number | null;
    phone?: string;
    photoUrl?: string;
    username?: string;
    password?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: "طلب غير صالح." }, { status: 400 });
  }

  if (body.resource === "center") {
    if (!access.canCenters) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
    const saved = await saveScCenter({
      id: body.id,
      name: String(body.name || ""),
      address: String(body.address || ""),
      governorate: String(body.governorate || ""),
      phones: Array.isArray(body.phones) ? body.phones.map(String) : [],
      headcount: Number(body.headcount) || 0,
    });
    if (!saved.ok) return NextResponse.json({ message: saved.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.resource === "job") {
    if (!access.canJobs && !access.canPermissions) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
    if (!access.canJobs && access.canPermissions) {
      if (!body.id) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
      const saved = await saveScJob({
        id: Number(body.id),
        title: String(body.title || ""),
        parentId: body.parentId == null ? null : Number(body.parentId),
        sortOrder: Number(body.sortOrder) || 0,
        responsibilities: String(body.responsibilities || ""),
        permissions: Array.isArray(body.permissions) ? body.permissions.map(String) : [],
      });
      if (!saved.ok) return NextResponse.json({ message: saved.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    const saved = await saveScJob({
      id: body.id,
      title: String(body.title || ""),
      parentId: body.parentId == null || body.parentId === 0 ? null : Number(body.parentId),
      sortOrder: Number(body.sortOrder) || 0,
      responsibilities: String(body.responsibilities || ""),
      permissions: Array.isArray(body.permissions) ? body.permissions.map(String) : [],
    });
    if (!saved.ok) return NextResponse.json({ message: saved.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.resource === "employee") {
    if (!access.canEmployees) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
    const saved = await saveScEmployee({
      id: body.id,
      centerId: Number(body.centerId),
      jobId: body.jobId == null || body.jobId === 0 ? null : Number(body.jobId),
      name: String(body.name || ""),
      phone: String(body.phone || ""),
      address: String(body.address || ""),
      photoUrl: String(body.photoUrl || ""),
      username: body.username,
      password: body.password,
    });
    if (!saved.ok) return NextResponse.json({ message: saved.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ message: "طلب ناقص." }, { status: 400 });
}

export async function DELETE(request: Request) {
  const access = await accessOf();
  if (!access) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  const url = new URL(request.url);
  const resource = url.searchParams.get("resource");
  const id = Number(url.searchParams.get("id"));
  if (!id) return NextResponse.json({ message: "المعرف ناقص." }, { status: 400 });
  if (resource === "center") {
    if (!access.canCenters) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
    const result = await deleteScCenter(id);
    if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  if (resource === "job") {
    if (!access.canJobs) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
    const result = await deleteScJob(id);
    if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  if (resource === "employee") {
    if (!access.canEmployees) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
    const result = await deleteScEmployee(id);
    if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ message: "طلب ناقص." }, { status: 400 });
}
