import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { canAccessTransfers } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { getTransfersAnalytics } from "@/lib/cs/transfers-analytics";
import { parseBalanceGrid, buildWarehouseTransferReport } from "@/lib/cs/warehouse-transfer-report";
import { getReorderProducts } from "@/lib/reorder-report";
import { requireCsSession } from "@/lib/session-guards";

export const maxDuration = 60;

async function requireTransfersAccess() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) return null;
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.canAccessTransfers && !canAccessTransfers(session.user.csRole)) return null;
  return session;
}

async function rowsFromFile(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const book = XLSX.read(buffer, { type: "buffer" });
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][];
}

export async function POST(request: Request) {
  const session = await requireTransfersAccess();
  if (!session) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const online = form?.get("online");
  const tenth = form?.get("tenth");
  const tenthHome = form?.get("tenthHome");
  if (!(online instanceof File) || !(tenth instanceof File) || !(tenthHome instanceof File)) {
    return NextResponse.json({ message: "ارفع ملفات الأونلاين والعاشر والعاشر المنزلي." }, { status: 400 });
  }
  if (!online.size || !tenth.size || !tenthHome.size) {
    return NextResponse.json({ message: "أحد الملفات فاضي." }, { status: 400 });
  }

  const parsed = await Promise.all(
    [
      ["أونلاين", online],
      ["العاشر", tenth],
      ["العاشر المنزلي", tenthHome],
    ].map(async ([label, file]) => {
      const grid = await rowsFromFile(file as File);
      const result = parseBalanceGrid(grid);
      return { label: String(label), result };
    }),
  );
  const failed = parsed.find((entry) => !entry.result.ok);
  if (failed && !failed.result.ok) {
    return NextResponse.json({ message: `${failed.label}: ${failed.result.message}` }, { status: 400 });
  }
  const [onlineFile, tenthFile, tenthHomeFile] = parsed.map((entry) =>
    entry.result.ok ? entry.result.file : null,
  );
  if (!onlineFile || !tenthFile || !tenthHomeFile) {
    return NextResponse.json({ message: "تعذر قراءة الملفات." }, { status: 400 });
  }

  try {
    const stock = await getReorderProducts({ bypassCache: true });
    let recommended = new Set<number>();
    try {
      const analytics = await getTransfersAnalytics();
      recommended = new Set(analytics.orderMore.map((row) => row.productId));
    } catch {
      recommended = new Set();
    }
    const report = buildWarehouseTransferReport({
      products: stock.products.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        model: product.model,
        threshold: product.threshold,
        systemRecommends: recommended.has(product.id) || product.isAtOrBelowThreshold,
      })),
      online: onlineFile.items,
      tenth: tenthFile.items,
      tenthHome: tenthHomeFile.items,
    });
    return NextResponse.json({
      columns: {
        online: `${onlineFile.codeHeader} / ${onlineFile.qtyHeader}`,
        tenth: `${tenthFile.codeHeader} / ${tenthFile.qtyHeader}`,
        tenthHome: `${tenthHomeFile.codeHeader} / ${tenthHomeFile.qtyHeader}`,
      },
      ...report,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر بناء تقرير التحويل.";
    return NextResponse.json({ message }, { status: 502 });
  }
}
