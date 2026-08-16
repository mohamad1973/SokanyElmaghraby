import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const report = JSON.parse(
  readFileSync(resolve("scripts/meta-catalog-audit-report.json"), "utf8"),
);

const isSk = (product) => /SK[-_ ]?\d+/i.test(product.name || "");
const line = (product) =>
  `- [${product.name}](${product.permalink}) (Woo ID ${product.id})`;

const skMissingImage = report.missingImageList.filter(isSk);
const skMissingPrice = report.missingPriceList.filter(isSk);
const otherMissingImage = report.missingImageList.filter((p) => !isSk(p));
const otherMissingPrice = report.missingPriceList.filter((p) => !isSk(p));

const md = `# منتجات تحتاج إصلاح قبل إرسالها من إنبوكس فيسبوك

تاريخ التدقيق: ${report.generatedAt}

المصدر: ووكومرس \`${report.store}\`. ملف JSON الكامل محلي في \`scripts/meta-catalog-audit-report.json\` ولا يُرفع إلى GitHub.

| البند | العدد |
|---|---:|
| منتجات منشورة | ${report.totals.publishedProducts} |
| بدون صورة | ${report.totals.missingImage} |
| بدون سعر | ${report.totals.missingPrice} |
| غير متوفر (out of stock) | ${report.totals.outOfStock} |
| بدون تصنيف | ${report.totals.noCats} |

أولوية الإصلاح: أصناف SK اللي العملاء بيسألوا عليها يوميًا. باقي القائمة غالبًا قطع غيار أو عناية شخصية قديمة.

## أصناف SK بدون صورة (${skMissingImage.length})

${skMissingImage.map(line).join("\n")}

## أصناف SK بدون سعر (${skMissingPrice.length})

${skMissingPrice.map(line).join("\n")}

## باقي المنتجات بدون صورة

${otherMissingImage.map(line).join("\n")}

## باقي المنتجات بدون سعر

${otherMissingPrice.map(line).join("\n")}
`;

const outPath = resolve("docs/MODERATOR_CATALOG_ISSUES.md");
writeFileSync(outPath, md, "utf8");
console.log(`Wrote ${outPath}`);
