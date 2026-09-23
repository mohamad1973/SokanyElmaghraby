import { NextResponse } from "next/server";

import { saveMediaAsset } from "@/lib/admin-media";
import { requireCsSession } from "@/lib/session-guards";

export const runtime = "nodejs";

const imageMimeTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/avif", "avif"],
]);

const maxImageFileSize = 4 * 1024 * 1024;

const extensionFallback: Record<string, string> = {
  ".jpg": "jpg",
  ".jpeg": "jpg",
  ".png": "png",
  ".webp": "webp",
  ".gif": "gif",
  ".avif": "avif",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function resolveImageExt(file: File): { ext: string; mime: string } | null {
  const fromMime = imageMimeTypes.get(file.type);
  if (fromMime) {
    return { ext: fromMime, mime: file.type };
  }

  const lowerName = file.name.toLowerCase();
  for (const [suffix, ext] of Object.entries(extensionFallback)) {
    if (lowerName.endsWith(suffix)) {
      const mime =
        ext === "jpg"
          ? "image/jpeg"
          : ext === "png"
            ? "image/png"
            : ext === "webp"
              ? "image/webp"
              : ext === "gif"
                ? "image/gif"
                : "image/avif";
      return { ext, mime };
    }
  }

  return null;
}

/** CS-authenticated image upload (deposit proof, etc.). Allowed on cs.tooliano.com via /api/cs/*. */
export async function POST(request: Request) {
  const session = await requireCsSession();
  if (!session?.user.csAgentId) {
    return NextResponse.json({ message: "غير مصرح." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const purpose = String(formData.get("purpose") || "deposit-proof").slice(0, 64);

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "لم يتم إرسال ملف صالح." }, { status: 400 });
  }

  const resolved = resolveImageExt(file);
  if (!resolved) {
    return NextResponse.json({ message: "صيغة الصورة غير مدعومة. استخدم jpg/png/webp/gif." }, { status: 400 });
  }

  if (file.size > maxImageFileSize) {
    return NextResponse.json({ message: "حجم الصورة كبير جداً. الحد الأقصى 4MB." }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const filename = `${slugify(purpose)}-${Date.now()}.${resolved.ext}`;

  try {
    return NextResponse.json(
      await saveMediaAsset({
        filename,
        mimeType: resolved.mime,
        size: file.size,
        purpose,
        data: buffer,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "تعذر حفظ الملف.",
      },
      { status: 500 },
    );
  }
}
