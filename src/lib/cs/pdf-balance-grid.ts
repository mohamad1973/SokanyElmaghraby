import { extractTextItems, type StructuredTextItem } from "unpdf";

const EMPTY_PDF_MESSAGE = "الشيت PDF مش فيه نص مقروء. ارفع شيت مُصدَّر، مش صورة.";
const QTY_HEADER = "الرصيدالفعلي";
const NAME_HEADER = "اسمالصنف";
const CODE_HEADER = "رمزالصنف";

const OUTPUT_HEADER = ["اسم الصنف", "الرصيد الفعلي"];

export async function rowsFromPdf(data: Uint8Array): Promise<string[][]> {
  let pages: StructuredTextItem[][];
  try {
    const extracted = await extractTextItems(data);
    pages = extracted.items;
  } catch {
    throw new Error("تعذر قراءة ملف PDF.");
  }

  const aligned = rowsFromTextPages(pages);
  if (aligned.length) return aligned;

  const rows: string[][] = [];
  let sawText = false;
  for (const page of pages) {
    const texts = page.filter((item) => item.str.trim());
    if (!texts.length) continue;
    sawText = true;
    rows.push(...rowsFromPage(texts));
  }
  if (!sawText && !pages.some((page) => page.length)) throw new Error(EMPTY_PDF_MESSAGE);
  if (!sawText) throw new Error(EMPTY_PDF_MESSAGE);
  return rows;
}

export function rowsFromTextPages(pages: StructuredTextItem[][]) {
  const rows: string[][] = [];
  let sawBalance = false;
  let carryAnchors: ColumnAnchors | null = null;
  for (const page of pages) {
    const texts = page.filter((item) => item.str.trim());
    if (!texts.length) continue;
    const lines = clusterLines(texts);
    const candidates = lines
      .map((line, index) => ({ index, anchors: anchorsFromLine(line) }))
      .filter((entry): entry is { index: number; anchors: ColumnAnchors } => Boolean(entry.anchors));
    if (!candidates.length) {
      if (!carryAnchors) continue;
      const body = lines
        .map((line) => rowFromLine(line, carryAnchors as ColumnAnchors))
        .filter((row) => row.some(Boolean) && !isHeaderRow(row));
      if (!body.some(hasBalance)) continue;
      if (!sawBalance) rows.push(OUTPUT_HEADER);
      sawBalance = true;
      rows.push(...body);
      continue;
    }
    for (let cursor = 0; cursor < candidates.length; cursor += 1) {
      const current = candidates[cursor];
      const nextIndex = candidates[cursor + 1]?.index ?? lines.length;
      const body = lines
        .slice(current.index + 1, nextIndex)
        .map((line) => rowFromLine(line, current.anchors))
        .filter((row) => row.some(Boolean) && !isHeaderRow(row));
      if (!body.some(hasBalance)) continue;
      if (!sawBalance) rows.push(OUTPUT_HEADER);
      sawBalance = true;
      carryAnchors = current.anchors;
      rows.push(...body);
    }
  }
  return sawBalance ? rows : [];
}

type ColumnAnchors = {
  name: { x0: number; x1: number };
  qty: { x0: number; x1: number };
  ignore: Array<{ x0: number; x1: number }>;
};

function normPhrase(value: string) {
  return value.trim().toLowerCase().replace(/[\s_\-./\\|]+/g, "");
}

function anchorsFromLine(line: StructuredTextItem[]): ColumnAnchors | null {
  const ordered = [...line].sort((a, b) => a.x - b.x);
  const name = findPhrase(ordered, NAME_HEADER);
  if (!name) return null;
  const blocked = new Set(name.indexes);
  const qty = findPhrase(ordered, QTY_HEADER, blocked);
  if (!qty) return null;
  const code = findPhrase(ordered, CODE_HEADER, new Set([...blocked, ...qty.indexes]));
  return { name: name.box, qty: qty.box, ignore: code ? [code.box] : [] };
}

function findPhrase(items: StructuredTextItem[], target: string, blocked = new Set<number>()) {
  const candidates: Array<{ start: number; end: number; rank: number }> = [];
  for (let width = 1; width <= 4; width += 1) {
    for (let start = 0; start <= items.length - width; start += 1) {
      const indexes = Array.from({ length: width }, (_, offset) => start + offset);
      if (indexes.some((index) => blocked.has(index))) continue;
      const slice = indexes.map((index) => items[index].str.trim()).filter(Boolean);
      if (!slice.length) continue;
      const forward = normPhrase(slice.join(""));
      const backward = normPhrase([...slice].reverse().join(""));
      let rank = 0;
      if (forward === target) rank = 4;
      else if (backward === target) rank = 3;
      else if (forward.includes(target)) rank = 2;
      else if (backward.includes(target)) rank = 1;
      else continue;
      candidates.push({ start, end: start + width - 1, rank });
    }
  }
  candidates.sort((a, b) => b.rank - a.rank || a.end - a.start - (b.end - b.start) || a.start - b.start);
  const found = candidates[0];
  if (!found) return null;
  const chosen = items.slice(found.start, found.end + 1);
  return {
    indexes: Array.from({ length: found.end - found.start + 1 }, (_, offset) => found.start + offset),
    box: {
      x0: Math.min(...chosen.map((item) => item.x)),
      x1: Math.max(...chosen.map((item) => item.x + Math.max(item.width, 1))),
    },
  };
}

function rowFromLine(line: StructuredTextItem[], anchors: ColumnAnchors) {
  const cells = ["", ""];
  const columns = [
    { slot: 0, box: anchors.name },
    { slot: 1, box: anchors.qty },
    ...anchors.ignore.map((box) => ({ slot: -1, box })),
  ];
  for (const item of [...line].sort((a, b) => a.x - b.x)) {
    const text = item.str.trim();
    if (!text) continue;
    const slot = nearestColumn(item, columns);
    if (slot == null || slot < 0) continue;
    cells[slot] = cells[slot] ? `${cells[slot]} ${text}` : text;
  }
  return cells;
}

function nearestColumn(
  item: StructuredTextItem,
  columns: Array<{ slot: number; box: { x0: number; x1: number } }>,
) {
  const center = item.x + Math.max(item.width, 1) / 2;
  const ranked = columns
    .map((column) => {
      const mid = (column.box.x0 + column.box.x1) / 2;
      return { slot: column.slot, mid, dist: Math.abs(center - mid), half: (column.box.x1 - column.box.x0) / 2 };
    })
    .sort((a, b) => a.mid - b.mid);
  let best = ranked[0];
  for (const column of ranked) {
    if (column.dist < best.dist) best = column;
  }
  const index = ranked.findIndex((column) => column.slot === best.slot);
  const left = index > 0 ? best.mid - ranked[index - 1].mid : Number.POSITIVE_INFINITY;
  const right = index < ranked.length - 1 ? ranked[index + 1].mid - best.mid : Number.POSITIVE_INFINITY;
  const limit = Math.max(Math.min(left, right) / 2, best.half + 8);
  return best.dist <= limit ? best.slot : null;
}

function hasBalance(row: string[]) {
  return Boolean(row[0].trim()) && leadingNumber(row[1]) != null;
}

function isHeaderRow(row: string[]) {
  return normPhrase(row[0]).includes(NAME_HEADER) || normPhrase(row[1]).includes(QTY_HEADER);
}

function leadingNumber(value: string) {
  const text = value
    .replace(/,/g, "")
    .replace(/(\d)\s+(?=\d)/g, "$1")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  const match = text.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const amount = Number(match[0]);
  return Number.isFinite(amount) ? amount : null;
}

function rowsFromPage(items: StructuredTextItem[]): string[][] {
  const lines = clusterLines(items);
  const breaks = columnBreaks(items);
  if (breaks.length < 3) {
    return lines.map((line) => cellsByGap(line)).filter((row) => row.some(Boolean));
  }
  return lines
    .map((line) => cellsByColumns(line, breaks))
    .filter((row) => row.some(Boolean));
}

function clusterLines(items: StructuredTextItem[]) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: StructuredTextItem[][] = [];
  for (const item of sorted) {
    const line = lines.at(-1);
    const anchor = line?.[0];
    if (line && anchor && Math.abs(anchor.y - item.y) <= lineTolerance(anchor, item)) {
      line.push(item);
    } else {
      lines.push([item]);
    }
  }
  return lines;
}

function lineTolerance(a: StructuredTextItem, b: StructuredTextItem) {
  const size = Math.max(a.fontSize || a.height || 8, b.fontSize || b.height || 8);
  return Math.max(2, size * 0.45);
}

function columnBreaks(items: StructuredTextItem[]) {
  const minX = Math.min(...items.map((item) => item.x));
  const maxX = Math.max(...items.map((item) => item.x + Math.max(item.width, 1)));
  const step = 2;
  const bins = Math.max(1, Math.ceil((maxX - minX) / step) + 1);
  const occupied = new Array<number>(bins).fill(0);
  for (const item of items) {
    const start = Math.max(0, Math.floor((item.x - minX) / step));
    const end = Math.min(bins - 1, Math.floor((item.x + Math.max(item.width, 1) - minX) / step));
    for (let index = start; index <= end; index += 1) occupied[index] += 1;
  }

  const breaks = [minX];
  let gapStart = -1;
  for (let index = 0; index <= bins; index += 1) {
    const empty = index === bins || occupied[index] === 0;
    if (empty && gapStart < 0) gapStart = index;
    if (!empty && gapStart >= 0) {
      const gapWidth = (index - gapStart) * step;
      if (gapWidth >= 8) breaks.push(minX + ((gapStart + index) / 2) * step);
      gapStart = -1;
    }
  }
  breaks.push(maxX + step);
  return breaks;
}

function cellsByColumns(line: StructuredTextItem[], breaks: number[]) {
  const cells = Array.from({ length: breaks.length - 1 }, () => "");
  const ordered = [...line].sort((a, b) => a.x - b.x);
  for (const item of ordered) {
    const text = item.str.trim();
    if (!text) continue;
    const center = item.x + Math.max(item.width, 1) / 2;
    let index = breaks.findIndex(
      (edge, edgeIndex) => edgeIndex < breaks.length - 1 && center >= edge && center < breaks[edgeIndex + 1],
    );
    if (index < 0) index = cells.length - 1;
    cells[index] = cells[index] ? `${cells[index]} ${text}` : text;
  }
  return cells.map((cell) => cell.trim());
}

function cellsByGap(line: StructuredTextItem[]) {
  const ordered = [...line].sort((a, b) => a.x - b.x);
  const cells: string[] = [];
  let current = "";
  let end = Number.NEGATIVE_INFINITY;
  let size = 8;
  for (const item of ordered) {
    const text = item.str.trim();
    if (!text) continue;
    const gap = item.x - end;
    const threshold = Math.max(10, size * 1.2);
    if (!current || gap > threshold) {
      if (current) cells.push(current);
      current = text;
    } else {
      current += gap > 1.5 ? ` ${text}` : text;
    }
    end = Math.max(end, item.x + Math.max(item.width, text.length * size * 0.45));
    size = item.fontSize || size;
  }
  if (current) cells.push(current);
  return cells;
}
