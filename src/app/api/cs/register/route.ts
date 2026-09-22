import { NextResponse } from "next/server";

import { createCsAgent, ensureCsTables, normalizeCsUsername } from "@/lib/cs/agents";

type Body = {
  name?: string;
  username?: string;
  /** @deprecated */
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  await ensureCsTables();

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ message: "طلب غير صالح." }, { status: 400 });
  }

  const name = String(body.name || "").trim();
  const username = normalizeCsUsername(String(body.username || body.email || ""));
  const password = String(body.password || "");

  if (!name || name.length < 2) {
    return NextResponse.json({ message: "اكتبي اسمك الظاهر (حرفين على الأقل)." }, { status: 400 });
  }

  if (!username || username.length < 2) {
    return NextResponse.json({ message: "أدخلي يوزرنيم صالحاً (حرفين على الأقل)." }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل." }, { status: 400 });
  }

  const result = await createCsAgent({ name, username, password, role: "agent" });
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    agent: {
      id: result.agent.id,
      name: result.agent.name,
      username: result.agent.username,
    },
  });
}
