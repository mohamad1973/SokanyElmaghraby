import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { canAccessTransfers } from "@/lib/cs/agents";
import { resolveCsViewer } from "@/lib/cs/confirmations";
import { rowsFromPdf } from "@/lib/cs/pdf-balance-grid";
import { assignWarehouseBalances, parseBalanceGrid, type BalanceRow } from "@/lib/cs/warehouse-transfer-report";
import { getReorderProducts } from "@/lib/reorder-report";
import { requireCsSession } from "@/lib/session-guards";
import {
  loadWarehouseSheets,
  saveWarehouseSheets,
  type StoredSheetRow,
  type WarehouseSheetKey,
} from "@/lib/cs/warehouse-sheets";

export const maxDuration = 60;

async function requireTransfersAccess() {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) return null;
  const viewer = await resolveCsViewer(session.user.csAgentId);
  if (!viewer.canAccessTransfers && !canAccessTransfers(session.user.csRole)) return null;
  return session;
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

async function rowsFromFile(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (isPdfFile(file)) return rowsFromPdf(new Uint8Array(buffer));
  const book = XLSX.read(buffer, { type: "buffer" });
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][];
}

function sheetRows(file: { items: BalanceRow[]; zeros: BalanceRow[] }): StoredSheetRow[] {
  return [...file.items, ...file.zeros].map((row) => ({ name: row.name || row.code, qty: row.qty }));
}

function balanceRows(rows: StoredSheetRow[]): BalanceRow[] {
  return rows.map((row) => ({ code: row.name, name: row.name, qty: row.qty }));
}

async function balancesFromStored(
  sheets: Array<{ warehouse: WarehouseSheetKey; rows: StoredSheetRow[] }>,
) {
  const byKey = new Map(sheets.map((sheet) => [sheet.warehouse, sheet.rows]));
  const stock = await getReorderProducts();
  return assignWarehouseBalances({
    products: stock.products.map((product) => ({
      id: product.id,
      name: product.name,
      model: product.model,
    })),
    online: balanceRows(byKey.get("online") || []),
    tenth: balanceRows(byKey.get("tenth") || []),
    tenthHome: balanceRows(byKey.get("tenthHome") || []),
  });
}

export async function GET() {
  const session = await requireTransfersAccess();
  if (!session) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
  try {
    const sheets = await loadWarehouseSheets();
    if (sheets.length < 3) return NextResponse.json({ balances: [], sheets: [] });
    const balances = await balancesFromStored(sheets);
    return NextResponse.json({
      balances,
      sheets: sheets.map((sheet) => ({
        warehouse: sheet.warehouse,
        fileName: sheet.fileName,
        updatedAt: sheet.updatedAt,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر قراءة الشيتات المحفوظة.";
    return NextResponse.json({ message }, { status: 502 });
  }
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
      try {
        const grid = await rowsFromFile(file as File);
        const result = parseBalanceGrid(grid);
        return { label: String(label), result };
      } catch (error) {
        const message = error instanceof Error ? error.message : "تعذر قراءة الملف.";
        return { label: String(label), result: { ok: false as const, message } };
      }
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
    const stored = [
      { warehouse: "online" as const, fileName: online.name, rows: sheetRows(onlineFile) },
      { warehouse: "tenth" as const, fileName: tenth.name, rows: sheetRows(tenthFile) },
      { warehouse: "tenthHome" as const, fileName: tenthHome.name, rows: sheetRows(tenthHomeFile) },
    ];
    const balances = assignWarehouseBalances({
      products: stock.products.map((product) => ({
        id: product.id,
        name: product.name,
        model: product.model,
      })),
      online: balanceRows(stored[0].rows),
      tenth: balanceRows(stored[1].rows),
      tenthHome: balanceRows(stored[2].rows),
    });
    const updatedAt = await saveWarehouseSheets(stored);
    return NextResponse.json({
      balances,
      sheets: stored.map((sheet) => ({
        warehouse: sheet.warehouse,
        fileName: sheet.fileName.trim().slice(0, 255) || "sheet",
        updatedAt,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر قراءة أرصدة المخازن.";
    return NextResponse.json({ message }, { status: 502 });
  }
}
