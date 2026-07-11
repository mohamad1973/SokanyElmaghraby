import { NextResponse } from "next/server";

import { getCustomerSession } from "@/lib/customer-account";
import { getPrismaClient } from "@/lib/db";
import { isProductListEntry, type ProductListEntry } from "@/lib/product-lists";

function parseEntries(value: unknown): ProductListEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isProductListEntry);
}

export async function GET() {
  const session = await getCustomerSession();

  if (!session) {
    return NextResponse.json({ entries: [] }, { status: 401 });
  }

  const prisma = getPrismaClient();

  if (!prisma) {
    return NextResponse.json({ entries: [] });
  }

  const record = await prisma.customerWishlist.findUnique({
    where: { customerId: session.customerId },
  });

  return NextResponse.json({
    entries: parseEntries(record?.entries),
  });
}

export async function PUT(request: Request) {
  const session = await getCustomerSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrismaClient();

  if (!prisma) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { entries?: unknown } | null;
  const entries = parseEntries(body?.entries);

  await prisma.customerWishlist.upsert({
    where: { customerId: session.customerId },
    create: {
      customerId: session.customerId,
      entries,
    },
    update: {
      entries,
    },
  });

  return NextResponse.json({ entries });
}
