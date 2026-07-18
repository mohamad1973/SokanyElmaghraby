import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { saveMediaAsset } from "@/lib/admin-media";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";

const imageMimeTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/svg+xml", "svg"],
  ["image/gif", "gif"],
  ["image/avif", "avif"],
]);
const videoMimeTypes = new Map([
  ["video/mp4", "mp4"],
  ["video/webm", "webm"],
]);
const audioMimeTypes = new Map([
  ["audio/mpeg", "mp3"],
  ["audio/mp3", "mp3"],
  ["audio/wav", "wav"],
  ["audio/x-wav", "wav"],
  ["audio/webm", "webm"],
  ["audio/ogg", "ogg"],
  ["audio/mp4", "m4a"],
  ["audio/aac", "aac"],
]);
const maxImageFileSize = 4 * 1024 * 1024;
const maxVideoFileSize = 25 * 1024 * 1024;
const maxAudioFileSize = 15 * 1024 * 1024;

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

  const imageExtension = imageMimeTypes.get(file.type);
  const videoExtension = videoMimeTypes.get(file.type);
  const audioExtension = audioMimeTypes.get(file.type);
  const extension = imageExtension || videoExtension || audioExtension;

  if (!extension) {
    return NextResponse.json(
      {
        message:
          "صيغة الملف غير مدعومة. الصيغ المتاحة: صور، فيديو mp4/webm، صوت mp3/wav/ogg/webm/m4a.",
      },
      { status: 400 },
    );
  }

  const maxFileSize = videoExtension
    ? maxVideoFileSize
    : audioExtension
      ? maxAudioFileSize
      : maxImageFileSize;

  if (file.size > maxFileSize) {
    return NextResponse.json(
      {
        message: videoExtension
          ? "حجم الفيديو كبير جداً. الحد الأقصى الحالي 25MB."
          : audioExtension
            ? "حجم الملف الصوتي كبير جداً. الحد الأقصى الحالي 15MB."
            : "حجم الصورة كبير جداً. الحد الأقصى الحالي 4MB.",
      },
      { status: 400 },
    );
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const filename = `${slugify(purpose)}-${Date.now()}.${extension}`;

  try {
    return NextResponse.json(
      await saveMediaAsset({
        filename,
        mimeType: file.type,
        size: file.size,
        purpose,
        data: buffer,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "تعذر حفظ الصورة في قاعدة البيانات.",
      },
      { status: 500 },
    );
  }
}

