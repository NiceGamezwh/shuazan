import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  createAdminSessionToken,
  getAdminCredentials,
  verifyAdminPassword,
} from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!getAdminCredentials()) {
    return NextResponse.json(
      { ok: false, error: "未配置 ADMIN_USERNAME / ADMIN_PASSWORD" },
      { status: 500 },
    );
  }

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体无效" }, { status: 400 });
  }

  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  if (!username || !password) {
    return NextResponse.json({ ok: false, error: "请输入账号和密码" }, { status: 400 });
  }

  if (!verifyAdminPassword(username, password)) {
    return NextResponse.json({ ok: false, error: "账号或密码错误" }, { status: 401 });
  }

  const token = createAdminSessionToken(username);
  const res = NextResponse.json({ ok: true, username });
  res.cookies.set(ADMIN_COOKIE, token, adminCookieOptions());
  return res;
}
