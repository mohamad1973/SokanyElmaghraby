import type { Product } from "@/lib/types";

function stripHtml(value = "") {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const ignoredLabels = new Set(["المواصفات", "الخاصية", "تفاصيل ومواصفات المنتج", "المواصفات الفنية"]);

const knownLabelPatterns = [
  /^النوع$/i,
  /^القدرة(?:\s+الكهربائية)?$/i,
  /^السعة$/i,
  /^عدد\s+القطع$/i,
  /^الاستخدامات$/i,
  /^الحرارة$/i,
  /^درجة\s+الحرارة$/i,
  /^السرعات$/i,
  /^المستويات$/i,
  /^المميزات$/i,
  /^الضمان$/i,
  /^الخامة$/i,
  /^اللون$/i,
  /^التشغيل$/i,
  /^الملحقات$/i,
  /^الشفرات$/i,
  /^الموديل$/i,
  /^الوزن$/i,
  /^الأبعاد$/i,
];

function isLikelyLabel(text: string): boolean {
  const normalized = text.trim();

  if (!normalized || normalized.length > 48) {
    return false;
  }

  return knownLabelPatterns.some((pattern) => pattern.test(normalized));
}

function detectLabelAndValue(first: string, second: string): { label: string; value: string } {
  const firstIsLabel = isLikelyLabel(first);
  const secondIsLabel = isLikelyLabel(second);

  if (firstIsLabel && !secondIsLabel) {
    return { label: first, value: second };
  }

  if (secondIsLabel && !firstIsLabel) {
    return { label: second, value: first };
  }

  if (first.length <= second.length) {
    return { label: first, value: second };
  }

  return { label: second, value: first };
}

function extractTableBlocks(html: string): string[] {
  const tables: string[] = [];
  const tablePattern = /<table[\s\S]*?<\/table>/gi;
  let match: RegExpExecArray | null;

  while ((match = tablePattern.exec(html))) {
    tables.push(match[0]);
  }

  return tables;
}

function extractRowBlocks(tableHtml: string): string[] {
  const rows: string[] = [];
  const rowPattern = /<tr[\s\S]*?<\/tr>/gi;
  let match: RegExpExecArray | null;

  while ((match = rowPattern.exec(tableHtml))) {
    rows.push(match[0]);
  }

  return rows;
}

function extractCellTexts(rowHtml: string): Array<{ type: "th" | "td"; text: string }> {
  const cells: Array<{ type: "th" | "td"; text: string }> = [];
  const cellPattern = /<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = cellPattern.exec(rowHtml))) {
    const text = stripHtml(match[2]);

    if (text) {
      cells.push({
        type: match[1].toLowerCase() as "th" | "td",
        text,
      });
    }
  }

  return cells;
}

function parseRowToSpec(rowHtml: string): { label: string; value: string } | null {
  const cells = extractCellTexts(rowHtml);

  if (cells.length < 2) {
    return null;
  }

  const thCells = cells.filter((cell) => cell.type === "th");
  const tdCells = cells.filter((cell) => cell.type === "td");

  if (thCells.length && tdCells.length) {
    return {
      label: thCells.map((cell) => cell.text).join(" "),
      value: tdCells.map((cell) => cell.text).join(" "),
    };
  }

  if (cells.length === 2) {
    return detectLabelAndValue(cells[0].text, cells[1].text);
  }

  const first = cells[0].text;
  const rest = cells
    .slice(1)
    .map((cell) => cell.text)
    .join(" ");

  return detectLabelAndValue(first, rest);
}

export function parseSpecsFromDescriptionHtml(html: string): Record<string, string> {
  const specs: Record<string, string> = {};

  extractTableBlocks(html).forEach((tableHtml) => {
    extractRowBlocks(tableHtml).forEach((rowHtml) => {
      const parsed = parseRowToSpec(rowHtml);

      if (!parsed) {
        return;
      }

      const label = parsed.label.trim();
      const value = parsed.value.trim();

      if (!label || !value || ignoredLabels.has(label)) {
        return;
      }

      specs[label] = value;
    });
  });

  return specs;
}

export function getProductSpecs(product: Product): Record<string, string> {
  const htmlSpecs = parseSpecsFromDescriptionHtml(product.descriptionHtml || "");

  if (Object.keys(htmlSpecs).length > 0) {
    return htmlSpecs;
  }

  return product.attributes;
}
