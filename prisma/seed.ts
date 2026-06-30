import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const defaultZones = [
  { name: "مدينة نصر", governorate: "القاهرة" },
  { name: "مصر الجديدة", governorate: "القاهرة" },
  { name: "المعادي", governorate: "القاهرة" },
  { name: "حلوان", governorate: "القاهرة" },
  { name: "شبرا", governorate: "القاهرة" },
  { name: "وسط البلد", governorate: "القاهرة" },
  { name: "التجمع الخامس", governorate: "القاهرة" },
  { name: "الدقي", governorate: "الجيزة" },
  { name: "المهندسين", governorate: "الجيزة" },
  { name: "فيصل", governorate: "الجيزة" },
  { name: "6 أكتوبر", governorate: "الجيزة" },
  { name: "الهرم", governorate: "الجيزة" },
  { name: "الشيخ زايد", governorate: "الجيزة" },
  { name: "إمبابة", governorate: "الجيزة" },
];

async function main() {
  const existing = await prisma.deliveryZone.count();

  if (existing > 0) {
    console.log(`Skipping zone seed — ${existing} zones already exist.`);
    return;
  }

  await prisma.deliveryZone.createMany({ data: defaultZones });
  console.log(`Seeded ${defaultZones.length} delivery zones for Cairo and Giza.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
