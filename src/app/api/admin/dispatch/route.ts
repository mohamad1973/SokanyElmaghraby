import { NextResponse } from "next/server";

import { assignOrderToDriver, autoAssignOrders, getDispatchBoardData, moveAssignment, optimizeRunRoute } from "@/lib/dispatch/assign-orders";
import { requireAdminSession } from "@/lib/session-guards";
import { getAdminOrder } from "@/lib/orders";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const data = await getDispatchBoardData();
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    action?: "auto-assign" | "assign" | "optimize" | "move";
    orderId?: number;
    driverId?: number;
    runId?: number;
    assignmentId?: number;
    targetDriverId?: number;
    sendOtp?: boolean;
  };

  if (body.action === "auto-assign") {
    const result = await autoAssignOrders({ sendOtp: body.sendOtp });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (body.action === "assign" && body.orderId && body.driverId) {
    const order = await getAdminOrder(String(body.orderId));

    if (!order) {
      return NextResponse.json({ message: "Order not found." }, { status: 404 });
    }

    const result = await assignOrderToDriver(order, body.driverId, { sendOtp: body.sendOtp });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (body.action === "optimize" && body.runId) {
    const result = await optimizeRunRoute(body.runId);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (body.action === "move" && body.assignmentId && body.targetDriverId) {
    const result = await moveAssignment(body.assignmentId, body.targetDriverId);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  return NextResponse.json({ message: "Invalid action." }, { status: 400 });
}
