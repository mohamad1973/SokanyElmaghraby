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
  ["audio/opus", "ogg"],
  ["audio/mp4", "m4a"],
  ["audio/x-m4a", "m4a"],
  ["audio/aac", "aac"],
]);
const maxImageFileSize = 4 * 1024 * 1024;
const maxVideoFileSize = 25 * 1024 * 1024;
const maxAudioFileSize = 15 * 1024 * 1024;

const extensionFallback: Record<string, { kind: "image" | "video" | "audio"; ext: string; mime: string }> = {
  ".jpg": { kind: "image", ext: "jpg", mime: "image/jpeg" },
  ".jpeg": { kind: "image", ext: "jpg", mime: "image/jpeg" },
  ".png": { kind: "image", ext: "png", mime: "image/png" },
  ".webp": { kind: "image", ext: "webp", mime: "image/webp" },
  ".gif": { kind: "image", ext: "gif", mime: "image/gif" },
  ".svg": { kind: "image", ext: "svg", mime: "image/svg+xml" },
  ".avif": { kind: "image", ext: "avif", mime: "image/avif" },
  ".mp4": { kind: "video", ext: "mp4", mime: "video/mp4" },
  ".webm": { kind: "video", ext: "webm", mime: "video/webm" },
  ".mp3": { kind: "audio", ext: "mp3", mime: "audio/mpeg" },
  ".wav": { kind: "audio", ext: "wav", mime: "audio/wav" },
  ".ogg": { kind: "audio", ext: "ogg", mime: "audio/ogg" },
  ".opus": { kind: "audio", ext: "ogg", mime: "audio/ogg" },
  ".m4a": { kind: "audio", ext: "m4a", mime: "audio/mp4" },
  ".aac": { kind: "audio", ext: "aac", mime: "audio/aac" },
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function resolveUpload(file: File): { kind: "image" | "video" | "audio"; ext: string; mime: string } | null {
  const imageExt = imageMimeTypes.get(file.type);
  if (imageExt) {
    return { kind: "image", ext: imageExt, mime: file.type };
  }

  const videoExt = videoMimeTypes.get(file.type);
  if (videoExt) {
    return { kind: "video", ext: videoExt, mime: file.type };
  }

  const audioExt = audioMimeTypes.get(file.type);
  if (audioExt) {
    return { kind: "audio", ext: audioExt, mime: file.type };
  }

  const lowerName = file.name.toLowerCase();
  for (const [suffix, meta] of Object.entries(extensionFallback)) {
    if (lowerName.endsWith(suffix)) {
      return meta;
    }
  }

  return null;
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

  const resolved = resolveUpload(file);

  if (!resolved) {
    return NextResponse.json(
      {
        message:
          "صيغة الملف غير مدعومة. الصيغ المتاحة: صور، فيديو mp4/webm، صوت mp3/wav/ogg/m4a/aac/webm.",
      },
      { status: 400 },
    );
  }

  const maxFileSize =
    resolved.kind === "video" ? maxVideoFileSize : resolved.kind === "audio" ? maxAudioFileSize : maxImageFileSize;

  if (file.size > maxFileSize) {
    return NextResponse.json(
      {
        message:
          resolved.kind === "video"
            ? "حجم الفيديو كبير جداً. الحد الأقصى الحالي 25MB."
            : resolved.kind === "audio"
              ? "حجم الملف الصوتي كبير جداً. الحد الأقصى الحالي 15MB."
              : "حجم الصورة كبير جداً. الحد الأقصى الحالي 4MB.",
      },
      { status: 400 },
    );
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const filename = `${slugify(purpose)}-${Date.now()}.${resolved.ext}`;

  try {
    return NextResponse.json(
      await saveMediaAsset({
        filename,
        mimeType: resolved.mime || file.type || "application/octet-stream",
        size: file.size,
        purpose,
        data: buffer,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "تعذر حفظ الملف في قاعدة البيانات.",
      },
      { status: 500 },
    );
  }
}
