import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/db";
import { requireDriverSession } from "@/lib/session-guards";
import { verifyOtp } from "@/lib/security";
import { markWooOrderDelivered } from "@/lib/woocommerce-update";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await requireDriverSession();

  if (!session?.user.driverId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const prisma = getPrismaClient();

  if (!prisma) {
    return NextResponse.json({ message: "Database unavailable" }, { status: 503 });
  }

  const assignment = await prisma.deliveryAssignment.findUnique({
    where: { id: Number.parseInt(id, 10) },
    include: {
      shipment: true,
      run: true,
    },
  });

  if (!assignment || assignment.run.driverId !== session.user.driverId) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ assignment });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await requireDriverSession();

  if (!session?.user.driverId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as { action?: "start" | "confirm" | "fail"; otp?: string; reason?: string };
  const prisma = getPrismaClient();

  if (!prisma) {
    return NextResponse.json({ message: "Database unavailable" }, { status: 503 });
  }

  const assignment = await prisma.deliveryAssignment.findUnique({
    where: { id: Number.parseInt(id, 10) },
    include: { shipment: true, run: { include: { driver: true } } },
  });

  if (!assignment || assignment.run.driverId !== session.user.driverId) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  if (body.action === "start") {
    const updated = await prisma.deliveryAssignment.update({
      where: { id: assignment.id },
      data: { status: "out_for_delivery" },
    });

    await prisma.shipment.update({
      where: { id: assignment.shipmentId },
      data: { status: "out_for_delivery" },
    });

    return NextResponse.json({ ok: true, assignment: updated });
  }

  if (body.action === "fail") {
    const updated = await prisma.deliveryAssignment.update({
      where: { id: assignment.id },
      data: { status: "failed", failReason: body.reason || "تعذر التسليم" },
    });

    await prisma.shipment.update({
      where: { id: assignment.shipmentId },
      data: { status: "failed" },
    });

    return NextResponse.json({ ok: true, assignment: updated });
  }

  if (body.action === "confirm") {
    if (!body.otp) {
      return NextResponse.json({ message: "OTP is required." }, { status: 400 });
    }

    const valid = await verifyOtp(body.otp, assignment.otpHash);

    if (!valid) {
      return NextResponse.json({ message: "كود التسليم غير صحيح." }, { status: 400 });
    }

    const updated = await prisma.deliveryAssignment.update({
      where: { id: assignment.id },
      data: { status: "delivered", deliveredAt: new Date() },
    });

    await prisma.shipment.update({
      where: { id: assignment.shipmentId },
      data: { status: "delivered" },
    });

    await markWooOrderDelivered(
      assignment.shipment.wooOrderId,
      `تم التسليم عبر المندوب ${assignment.run.driver.name}`,
    );

    return NextResponse.json({ ok: true, assignment: updated });
  }

  return NextResponse.json({ message: "Invalid action." }, { status: 400 });
}
