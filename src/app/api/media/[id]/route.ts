import { NextResponse } from "next/server";

import { getMediaAsset } from "@/lib/admin-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const numericId = Number(id);

  if (!Number.isInteger(numericId)) {
    return NextResponse.json({ message: "Invalid media id." }, { status: 400 });
  }

  const asset = await getMediaAsset(numericId);

  if (!asset) {
    return NextResponse.json({ message: "Media not found." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(asset.data), {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="${asset.filename}"`,
      "Content-Length": String(asset.size),
      "Content-Type": asset.mimeType,
    },
  });
}
