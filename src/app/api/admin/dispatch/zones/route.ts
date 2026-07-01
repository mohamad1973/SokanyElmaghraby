import { NextResponse } from "next/server";

import { createZone, deleteZone, listDistrictsWithAreas, updateZone } from "@/lib/dispatch/zones";
import { requireAdminSession } from "@/lib/session-guards";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const districts = await listDistrictsWithAreas();
  return NextResponse.json({ districts, zones: districts });
}

export async function POST(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    name?: string;
    governorate?: string;
    parentId?: number | null;
    polygon?: unknown;
  };

  if (!body.name) {
    return NextResponse.json({ message: "name is required." }, { status: 400 });
  }

  if (!body.parentId && !body.governorate) {
    return NextResponse.json({ message: "governorate is required for districts." }, { status: 400 });
  }

  const result = await createZone({
    name: body.name,
    governorate: body.governorate || "",
    parentId: body.parentId ?? null,
    polygon: body.polygon,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export async function PATCH(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    id?: number;
    name?: string;
    governorate?: string;
    polygon?: unknown;
  };

  if (!body.id) {
    return NextResponse.json({ message: "id is required." }, { status: 400 });
  }

  const result = await updateZone(body.id, body);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export async function DELETE(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { id?: number };

  if (!body.id) {
    return NextResponse.json({ message: "id is required." }, { status: 400 });
  }

  const result = await deleteZone(body.id);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
