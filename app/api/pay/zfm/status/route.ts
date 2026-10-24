import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, verifySessionToken } from "@/lib/auth";
import { findZfmOrder } from "@/lib/zfm";

export const runtime = "nodejs";

/** GET /api/pay/zfm/status?orderNo=... 查询本地订单状态（需登录） */
export async function GET(request: NextRequest) {
  const token =
    extractBearerToken(request.headers.get("authorization")) ||
    request.nextUrl.searchParams.get("token")?.trim() ||
    null;
  const session = verifySessionToken(token);
  if (!session?.username) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
  }

  const orderNo = request.nextUrl.searchParams.get("orderNo")?.trim() || "";
  if (!orderNo) {
    return NextResponse.json({ ok: false, error: "缺少 orderNo" }, { status: 400 });
  }

  const order = await findZfmOrder(orderNo);
  if (!order) {
    return NextResponse.json({ ok: false, error: "订单不存在" }, { status: 404 });
  }
  if (order.username !== session.username) {
    return NextResponse.json({ ok: false, error: "无权查看" }, { status: 403 });
  }

  const creditFen = order.creditFen ?? order.amountFen;
  const creditYuan = order.creditYuanStr ?? order.amountYuanStr;

  return NextResponse.json({
    ok: true,
    orderNo: order.orderNo,
    status: order.status,
    /** 应付（含手续费） */
    amountFen: order.amountFen,
    amountYuan: order.amountYuanStr,
    /** 到账 */
    creditFen,
    creditYuan,
    paidAt: order.paidAt ?? null,
    txHash: order.txHash ?? null,
  });
}
