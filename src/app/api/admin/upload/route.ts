import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";

const allowedMimeTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/svg+xml", "svg"],
  ["image/gif", "gif"],
  ["image/avif", "avif"],
]);

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const purpose = String(formData.get("purpose") || "image");

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "لم يتم إرسال ملف صالح." }, { status: 400 });
  }

  const extension = allowedMimeTypes.get(file.type);

  if (!extension) {
    return NextResponse.json(
      { message: "صيغة الصورة غير مدعومة. الصيغ المتاحة: jpg, png, webp, svg, gif, avif." },
      { status: 400 },
    );
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const uploadDirectory = path.join(process.cwd(), "public", "uploads", "admin");
  const filename = `${slugify(purpose)}-${Date.now()}.${extension}`;
  const filePath = path.join(uploadDirectory, filename);

  await mkdir(uploadDirectory, { recursive: true });
  await writeFile(filePath, buffer);

  return NextResponse.json({
    url: `/uploads/admin/${filename}`,
    filename,
    size: file.size,
    type: file.type,
  });
}

