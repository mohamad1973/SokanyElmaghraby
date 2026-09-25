import { extractModelFromTitle, extractSkFromTitle } from "@/lib/product-display-code";

export type BalanceRow = {
  code: string;
  name: string;
  qty: number;
};

export type ParsedBalanceFile = {
  items: BalanceRow[];
  zeros: BalanceRow[];
  codeHeader: string;
  qtyHeader: string;
};

export type CatalogProduct = {
  id: number;
  name: string;
  sku: string;
  model: string;
  threshold: number;
  systemRecommends: boolean;
};

export type TransferSuggestion = {
  productId: number;
  name: string;
  model: string;
  sku: string;
  onlineQty: number;
  threshold: number;
  tenthQty: number;
  tenthHomeQty: number;
  suggestedQty: number;
  source: "العاشر" | "العاشر منزلي";
  systemRecommends: boolean;
};

export type UnmatchedBalance = {
  warehouse: string;
  code: string;
  name: string;
  qty: number;
  reason: string;
};

const CODE_HEADERS = new Set([
  "موديل",
  "الموديل",
  "كود",
  "الكود",
  "كودالصنف",
  "كودالموديل",
  "sku",
  "model",
  "itemcode",
  "code",
  "barcode",
  "الباركود",
]);

const QTY_HEADERS = new Set([
  "رصيد",
  "الرصيد",
  "كمية",
  "الكمية",
  "qty",
  "quantity",
  "balance",
  "المخزون",
  "العدد",
  "onhand",
  "المتاح",
]);

const NAME_HEADERS = new Set([
  "اسم",
  "الاسم",
  "الصنف",
  "اسمالصنف",
  "البيان",
  "description",
  "name",
  "الوصف",
]);

function normHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s_\-./\\|]+/g, "");
}

function cellText(value: unknown) {
  return String(value ?? "").trim();
}

function parseQty(value: unknown) {
  const text = cellText(value)
    .replace(/,/g, "")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  if (!text || text === "-") return null;
  const amount = Number(text);
  if (!Number.isFinite(amount)) return null;
  return Math.max(0, Math.round(amount));
}

function codeKeys(code: string) {
  const compact = code.trim().toUpperCase().replace(/[\s_\-]+/g, "");
  if (!compact) return [];
  const keys = new Set<string>([compact]);
  const stripped = compact.replace(/^SK/, "");
  if (stripped) keys.add(stripped);
  const fromTitle = extractModelFromTitle(code) || extractSkFromTitle(code);
  if (fromTitle) keys.add(fromTitle.toUpperCase().replace(/[\s_\-]+/g, ""));
  const digits = compact.replace(/\D/g, "");
  if (digits.length >= 3 && digits.length <= 8 && digits.length >= compact.replace(/\D/g, "").length) {
    keys.add(digits);
  }
  return [...keys];
}

export function parseBalanceGrid(rows: unknown[][]): { ok: true; file: ParsedBalanceFile } | { ok: false; message: string } {
  const grid = rows
    .map((row) => (Array.isArray(row) ? row : []))
    .filter((row) => row.some((cell) => cellText(cell)));
  let headerIndex = -1;
  let codeIndex = -1;
  let qtyIndex = -1;
  let nameIndex = -1;
  const scanLimit = Math.min(grid.length, 15);
  for (let index = 0; index < scanLimit; index += 1) {
    const cells = grid[index].map((cell) => normHeader(cellText(cell)));
    const code = cells.findIndex((cell) => CODE_HEADERS.has(cell));
    const qty = cells.findIndex((cell) => QTY_HEADERS.has(cell));
    if (code >= 0 && qty >= 0) {
      headerIndex = index;
      codeIndex = code;
      qtyIndex = qty;
      nameIndex = cells.findIndex((cell) => NAME_HEADERS.has(cell));
      break;
    }
  }
  if (headerIndex < 0) {
    return {
      ok: false,
      message: "مش لاقي عمود الموديل أو الكود، وعمود الرصيد، في أول صفوف الملف.",
    };
  }
  const items: BalanceRow[] = [];
  const zeros: BalanceRow[] = [];
  for (const row of grid.slice(headerIndex + 1)) {
    const code = cellText(row[codeIndex]);
    const qty = parseQty(row[qtyIndex]);
    if (!code || qty == null) continue;
    const entry = {
      code,
      name: nameIndex >= 0 ? cellText(row[nameIndex]) : "",
      qty,
    };
    if (qty === 0) zeros.push(entry);
    else items.push(entry);
  }
  if (!items.length && !zeros.length) {
    return { ok: false, message: "الملف فيه عناوين بس مفيش أصناف برصيد." };
  }
  return {
    ok: true,
    file: {
      items,
      zeros,
      codeHeader: cellText(grid[headerIndex][codeIndex]),
      qtyHeader: cellText(grid[headerIndex][qtyIndex]),
    },
  };
}

type ProductBucket = {
  product: CatalogProduct;
  onlineQty: number | null;
  tenthQty: number;
  tenthHomeQty: number;
};

const AMBIGUOUS = Symbol("ambiguous");

function indexProducts(products: CatalogProduct[]) {
  const map = new Map<string, CatalogProduct | typeof AMBIGUOUS>();
  const add = (key: string, product: CatalogProduct) => {
    if (!key) return;
    const existing = map.get(key);
    if (!existing) map.set(key, product);
    else if (existing !== AMBIGUOUS && existing.id !== product.id) map.set(key, AMBIGUOUS);
  };
  for (const product of products) {
    for (const key of [...codeKeys(product.model), ...codeKeys(product.sku), ...codeKeys(product.name)]) {
      add(key, product);
    }
  }
  return map;
}

function matchProduct(map: Map<string, CatalogProduct | typeof AMBIGUOUS>, row: BalanceRow) {
  for (const key of [...codeKeys(row.code), ...codeKeys(row.name)]) {
    const hit = map.get(key);
    if (hit && hit !== AMBIGUOUS) return hit;
  }
  return null;
}

export function buildWarehouseTransferReport(input: {
  products: CatalogProduct[];
  online: BalanceRow[];
  onlineZeros?: BalanceRow[];
  tenth: BalanceRow[];
  tenthHome: BalanceRow[];
}) {
  const index = indexProducts(input.products);
  const buckets = new Map<number, ProductBucket>();
  const unmatched: UnmatchedBalance[] = [];
  const ensure = (product: CatalogProduct) => {
    const current = buckets.get(product.id);
    if (current) return current;
    const created: ProductBucket = { product, onlineQty: null, tenthQty: 0, tenthHomeQty: 0 };
    buckets.set(product.id, created);
    return created;
  };

  const consume = (warehouse: string, rows: BalanceRow[], apply: (bucket: ProductBucket, row: BalanceRow) => void) => {
    for (const row of rows) {
      const product = matchProduct(index, row);
      if (!product) {
        unmatched.push({
          warehouse,
          code: row.code,
          name: row.name,
          qty: row.qty,
          reason: "مش مطابق لصنف على الموقع",
        });
        continue;
      }
      apply(ensure(product), row);
    }
  };

  consume("أونلاين", input.online, (bucket, row) => {
    bucket.onlineQty = (bucket.onlineQty ?? 0) + row.qty;
  });
  for (const row of input.onlineZeros || []) {
    const product = matchProduct(index, row);
    if (!product) continue;
    const bucket = ensure(product);
    if (bucket.onlineQty == null) bucket.onlineQty = 0;
  }
  consume("العاشر", input.tenth, (bucket, row) => {
    bucket.tenthQty += row.qty;
  });
  consume("العاشر منزلي", input.tenthHome, (bucket, row) => {
    bucket.tenthHomeQty += row.qty;
  });

  const suggestions: TransferSuggestion[] = [];
  for (const bucket of buckets.values()) {
    const { product } = bucket;
    if (product.threshold <= 0) {
      const qty = bucket.onlineQty ?? 0;
      if (qty <= 0 && bucket.tenthQty <= 0 && bucket.tenthHomeQty <= 0) continue;
      unmatched.push({
        warehouse: "أونلاين",
        code: product.model || product.sku,
        name: product.name,
        qty: qty || bucket.tenthQty || bucket.tenthHomeQty,
        reason: "لم يُحفظ له حد طلب",
      });
      continue;
    }
    if (bucket.onlineQty == null) {
      unmatched.push({
        warehouse: "أونلاين",
        code: product.model || product.sku,
        name: product.name,
        qty: 0,
        reason: "مش موجود في ملف الأونلاين",
      });
      continue;
    }
    if (bucket.onlineQty > product.threshold) continue;
    if (bucket.tenthQty <= 0 && bucket.tenthHomeQty <= 0) continue;
    const source = bucket.tenthQty >= bucket.tenthHomeQty ? "العاشر" : "العاشر منزلي";
    const sourceQty = source === "العاشر" ? bucket.tenthQty : bucket.tenthHomeQty;
    suggestions.push({
      productId: product.id,
      name: product.name,
      model: product.model,
      sku: product.sku,
      onlineQty: bucket.onlineQty,
      threshold: product.threshold,
      tenthQty: bucket.tenthQty,
      tenthHomeQty: bucket.tenthHomeQty,
      suggestedQty: Math.min(Math.max(0, product.threshold - bucket.onlineQty), sourceQty),
      source,
      systemRecommends: product.systemRecommends,
    });
  }

  suggestions.sort((a, b) => {
    if (a.systemRecommends !== b.systemRecommends) return a.systemRecommends ? -1 : 1;
    return b.suggestedQty - a.suggestedQty || a.name.localeCompare(b.name, "ar");
  });

  return { suggestions, unmatched };
}
