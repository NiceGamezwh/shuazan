import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, verifySessionToken } from "@/lib/auth";
import {
  findZfmOrder,
  getZfmConfig,
  signNotify,
} from "@/lib/zfm";

export const runtime = "nodejs";

/**
 * 仅 development + ZFM_MOCK_NOTIFY=1 可用。
 * POST { orderNo }（需登录且订单属于自己）→ 伪造已验签回调打到本机 notify。
 */
export async function POST(request: NextRequest) {
  const cfg = getZfmConfig();
  if (!cfg.mockNotifyEnabled) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "模拟回调未开启。仅 NODE_ENV=development 且 .env.local 设置 ZFM_MOCK_NOTIFY=1 时可用",
      },
      { status: 403 },
    );
  }

  const token = extractBearerToken(request.headers.get("authorization"));
  const session = verifySessionToken(token);
  if (!session?.username) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
  }

  let body: { orderNo?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "请求体必须是 JSON" }, { status: 400 });
  }

  const orderNo = String(body.orderNo || "").trim();
  if (!orderNo) {
    return NextResponse.json({ ok: false, error: "缺少 orderNo" }, { status: 400 });
  }

  const order = await findZfmOrder(orderNo);
  if (!order) {
    return NextResponse.json({ ok: false, error: "订单不存在" }, { status: 404 });
  }
  if (order.username !== session.username) {
    return NextResponse.json({ ok: false, error: "只能模拟自己的订单" }, { status: 403 });
  }

  const state = "1";
  const amount = order.amountYuanStr;
  const sign = signNotify({
    state,
    merchantNum: cfg.merchantNum,
    orderNo,
    amount,
    secret: cfg.secret,
  });

  const origin = request.nextUrl.origin;
  const qs = new URLSearchParams({
    merchantNum: cfg.merchantNum,
    orderNo,
    amount,
    state,
    sign,
    type: cfg.payType || "aloop",
    platformOrderNo: `mock-${Date.now()}`,
    actualPayAmount: amount,
    payTime: new Date().toISOString().replace("T", " ").slice(0, 19),
    payee: "mock",
  });

  const notifyUrl = `${origin}/api/pay/zfm/notify?${qs.toString()}`;
  const res = await fetch(notifyUrl, { method: "GET", cache: "no-store" });
  const text = await res.text();

  return NextResponse.json({
    ok: text.trim() === "success",
    notifyStatus: res.status,
    notifyBody: text.trim(),
    orderNo,
    amount,
  });
}
