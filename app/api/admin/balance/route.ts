import { NextResponse } from "next/server";
import { readAdminSession } from "@/lib/admin-auth";
import {
  fetchXysq3UserBalance,
  toAdminDisplayYuan,
  ADMIN_BALANCE_DISPLAY_MULT,
} from "@/lib/xysq3-user";

export const runtime = "nodejs";

export async function GET() {
  const session = await readAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
  }

  try {
    const upstream = await fetchXysq3UserBalance();
    const displayYuan = toAdminDisplayYuan(upstream.balanceYuan);
    return NextResponse.json({
      ok: true,
      displayYuan,
      displayYuanStr: displayYuan.toFixed(2),
      multiplier: ADMIN_BALANCE_DISPLAY_MULT,
      note: "展示系数已含",
      // do not expose token / Pwd / raw upstream object
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "读取上游余额失败";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
