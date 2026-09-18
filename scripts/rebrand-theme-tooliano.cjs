require("dotenv").config({ path: ".env.local" });
const { PrismaClient } = require("@prisma/client");

/**
 * Patch live ThemeSettings branding to Tooliano:
 * - logoText = Tooliano
 * - tagline cleared (remove مؤسسة المغربي)
 * - topBanner text = Tooliano only
 * - replace سوكاني / SOKANY / مؤسسة المغربي strings in nested settings JSON
 */
const prisma = new PrismaClient();

function rebrandString(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/مؤسسة المغربي الوكيل الحصري لسوكاني في مصر/g, "Tooliano")
    .replace(/مؤسسة المغربي الوكيل الحصري/g, "Tooliano")
    .replace(/مؤسسة المغربي/g, "")
    .replace(/سوكاني إيجبت/g, "Tooliano")
    .replace(/سوكاني/g, "توليانو")
    .replace(/SOKANY Egypt/g, "Tooliano")
    .replace(/SOKANY/g, "Tooliano")
    .replace(/Sokany/g, "Tooliano")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function deepRebrand(node) {
  if (Array.isArray(node)) {
    return node.map(deepRebrand);
  }
  if (node && typeof node === "object") {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      out[key] = deepRebrand(value);
    }
    return out;
  }
  return rebrandString(node);
}

async function main() {
  const rows = await prisma.$queryRawUnsafe(`SELECT id, settings FROM ThemeSettings WHERE id = 1 LIMIT 1`);
  if (!rows.length) {
    throw new Error("ThemeSettings row id=1 not found");
  }

  let settings = rows[0].settings;
  if (typeof settings === "string") {
    settings = JSON.parse(settings);
  }

  settings = deepRebrand(settings);
  settings.brand = {
    ...(settings.brand || {}),
    logoText: "Tooliano",
    tagline: "",
  };
  settings.topBanner = {
    ...(settings.topBanner || {}),
    text: "Tooliano",
  };

  const json = JSON.stringify(settings);
  await prisma.$executeRaw`
    UPDATE ThemeSettings
    SET settings = ${json}, updatedAt = CURRENT_TIMESTAMP(3)
    WHERE id = 1
  `;
  console.log("ThemeSettings rebranded to Tooliano");
  console.log("logoText=", settings.brand.logoText);
  console.log("tagline=", JSON.stringify(settings.brand.tagline));
  console.log("topBanner.text=", settings.topBanner.text);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
