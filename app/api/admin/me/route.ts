import { NextResponse } from "next/server";
import { readAdminSession } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await readAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, username: session.username });
}
