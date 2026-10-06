import { extractTextItems, type StructuredTextItem } from "unpdf";

const EMPTY_PDF_MESSAGE = "الشيت PDF مش فيه نص مقروء. ارفع شيت مُصدَّر، مش صورة.";

export async function rowsFromPdf(data: Uint8Array): Promise<string[][]> {
  let pages: StructuredTextItem[][];
  try {
    const extracted = await extractTextItems(data);
    pages = extracted.items;
  } catch {
    throw new Error("تعذر قراءة ملف PDF.");
  }

  const rows: string[][] = [];
  let sawText = false;
  for (const page of pages) {
    const texts = page.filter((item) => item.str.trim());
    if (!texts.length) continue;
    sawText = true;
    rows.push(...rowsFromPage(texts));
  }
  if (!sawText) throw new Error(EMPTY_PDF_MESSAGE);
  return rows;
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
