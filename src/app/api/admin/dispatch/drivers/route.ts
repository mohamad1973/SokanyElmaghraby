import { NextResponse } from "next/server";

import { createDriver, listDrivers, updateDriver } from "@/lib/dispatch/drivers";
import { requireAdminSession } from "@/lib/session-guards";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const drivers = await listDrivers();
  return NextResponse.json({ drivers });
}

export async function POST(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    name?: string;
    phone?: string;
    email?: string;
    password?: string;
    maxOrders?: number;
    maxCodValue?: number;
    zoneIds?: number[];
  };

  if (!body.name || !body.phone || !body.password) {
    return NextResponse.json({ message: "name, phone, password are required." }, { status: 400 });
  }

  const result = await createDriver({
    name: body.name,
    phone: body.phone,
    email: body.email,
    password: body.password,
    maxOrders: body.maxOrders,
    maxCodValue: body.maxCodValue,
    zoneIds: body.zoneIds,
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
    phone?: string;
    email?: string;
    password?: string;
    isActive?: boolean;
    maxOrders?: number;
    maxCodValue?: number;
    zoneIds?: number[];
  };

  if (!body.id) {
    return NextResponse.json({ message: "id is required." }, { status: 400 });
  }

  const result = await updateDriver(body.id, body);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
