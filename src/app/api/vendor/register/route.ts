import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { getPrismaClient, isDatabaseConfigured } from "@/lib/db";
import { GB_APPROVAL_STATUS, GB_ROLES } from "@/lib/group-buy/constants";

type VendorRegisterBody = {
  username?: string;
  password?: string;
  companyName?: string;
  contactName?: string;
  phone?: string;
  contactEmail?: string;
  address?: string;
  businessType?: string;
  teamSize?: number;
  productTypesDescription?: string;
  productName?: string;
  productType?: string;
  productDescription?: string;
  suggestedQuantity?: number;
  suggestedRetailPrice?: number;
  suggestedGroupPrice?: number;
};

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { message: "قاعدة البيانات غير مضبوطة. عيّن DATABASE_URL." },
      { status: 503 },
    );
  }

  const prisma = getPrismaClient();
  if (!prisma) {
    return NextResponse.json({ message: "تعذر الاتصال بقاعدة البيانات." }, { status: 503 });
  }

  let body: VendorRegisterBody;
  try {
    body = (await request.json()) as VendorRegisterBody;
  } catch {
    return NextResponse.json({ message: "طلب غير صالح." }, { status: 400 });
  }

  const username = body.username?.trim();
  const password = body.password ?? "";
  const companyName = body.companyName?.trim();
  const contactName = body.contactName?.trim();
  const phone = body.phone?.trim();
  const contactEmail = body.contactEmail?.trim();
  const address = body.address?.trim();
  const businessType = body.businessType?.trim() || "عام";
  const productName = body.productName?.trim();
  const productType = body.productType?.trim() || "منتج";
  const suggestedQuantity = Number(body.suggestedQuantity || 0);
  const suggestedGroupPrice = Number(body.suggestedGroupPrice || 0);

  if (
    !username ||
    password.length < 6 ||
    !companyName ||
    !contactName ||
    !phone ||
    !contactEmail ||
    !address ||
    !productName ||
    suggestedQuantity < 1 ||
    suggestedGroupPrice <= 0
  ) {
    return NextResponse.json(
      { message: "أكمل بيانات الفيندور والمنتج الأول (كمية وسعر جماعي)." },
      { status: 400 },
    );
  }

  const existing = await prisma.gbUser.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ message: "اسم المستخدم مستخدم بالفعل." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const settlement =
    Math.round(suggestedGroupPrice * 0.86 * 100) / 100;

  const user = await prisma.gbUser.create({
    data: {
      username,
      passwordHash,
      role: GB_ROLES.VENDOR,
      phone,
      email: contactEmail,
      vendorProfile: {
        create: {
          companyName,
          contactName,
          phone,
          contactEmail,
          address,
          businessType,
          teamSize: Math.max(1, Number(body.teamSize || 1)),
          productTypesDescription: body.productTypesDescription?.trim() || productType,
          status: GB_APPROVAL_STATUS.PENDING,
        },
      },
      productSubmissions: {
        create: {
          productName,
          productType,
          productDescription: body.productDescription?.trim() || "",
          suggestedQuantity,
          suggestedRetailPrice: body.suggestedRetailPrice
            ? Number(body.suggestedRetailPrice)
            : null,
          suggestedGroupPrice,
          vendorSettlementUnitPrice: settlement,
          status: GB_APPROVAL_STATUS.PENDING,
        },
      },
    },
    include: {
      vendorProfile: true,
      productSubmissions: true,
    },
  });

  return NextResponse.json({
    ok: true,
    message: "تم تسجيل الفيندور. بانتظار موافقة الأدمن.",
    vendorId: user.id,
    submissionId: user.productSubmissions[0]?.id,
  });
}
