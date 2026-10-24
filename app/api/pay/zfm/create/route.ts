import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, verifySessionToken } from "@/lib/auth";
import { hashUsername } from "@/lib/ledger";
import {
  alipayPayFen,
  fenToYuanStr,
  parseYuanToFen,
} from "@/lib/recharge-pricing";
import {
  generateOrderNo,
  getZfmConfig,
  isZfmPlaceholderNotify,
  startZfmOrder,
  upsertZfmOrder,
  zfmLedgerOrderId,
} from "@/lib/zfm";

export const runtime = "nodejs";

/**
 * POST /api/pay/zfm/create
 * body: { amountYuan }  // 用户填写的到账金额（元）
 * 支付渠道订单金额 = 到账 × 1.03（向上取整到分）；入账仍按到账全额。
 */
export async function POST(request: NextRequest) {
  const token = extractBearerToken(request.headers.get("authorization"));
  const session = verifySessionToken(token);
  if (!session?.username) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
  }

  const cfg = getZfmConfig();
  if (!cfg.merchantNum || !cfg.secret) {
    return NextResponse.json(
      { ok: false, error: "服务端未配置支付FM（ZFM_MERCHANT_NUM / ZFM_SECRET）" },
      { status: 500 },
    );
  }
  if (!cfg.notifyUrl) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "未配置 ZFM_NOTIFY_URL。本地请任选：① .env.local 设 ZFM_MOCK_NOTIFY=1 后重启，用「模拟回调」到账；② 或 ngrok http 3001 后写入公网 ZFM_NOTIFY_URL",
        hint: "ZFM_MOCK_NOTIFY=1  或  ZFM_NOTIFY_URL=https://xxxx.ngrok-free.app/api/pay/zfm/notify",
        mockNotifyEnabled: cfg.mockNotifyEnabled,
      },
      { status: 503 },
    );
  }

  let body: { amountYuan?: number | string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "请求体必须是 JSON" }, { status: 400 });
  }

  let creditFen: number;
  try {
    creditFen = parseYuanToFen(body.amountYuan);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "金额无效" },
      { status: 400 },
    );
  }

  const creditYuanStr = fenToYuanStr(creditFen);
  const payFen = alipayPayFen(creditFen);
  const payYuanStr = fenToYuanStr(payFen);

  const orderNo = generateOrderNo();
  const usernameHash = hashUsername(session.username);
  const usingPlaceholderNotify = isZfmPlaceholderNotify(cfg.notifyUrl);

  try {
    let payUrl = "";
    let platformId = "";
    let localMockOnly = false;

    try {
      const started = await startZfmOrder({
        orderNo,
        amountYuanStr: payYuanStr,
        subject: `账号充值-${session.username}`,
      });
      payUrl = started.payUrl;
      platformId = started.platformId || "";
    } catch (upstreamErr) {
      if (!(cfg.mockNotifyEnabled && usingPlaceholderNotify)) {
        throw upstreamErr;
      }
      localMockOnly = true;
      platformId = "local-mock";
      console.warn(
        "[zfm/create] upstream startOrder failed; continuing with local mock order:",
        upstreamErr instanceof Error ? upstreamErr.message : upstreamErr,
      );
    }

    await upsertZfmOrder({
      orderNo,
      username: session.username,
      usernameHash,
      amountFen: payFen,
      amountYuanStr: payYuanStr,
      creditFen,
      creditYuanStr,
      status: "pending",
      createdAt: new Date().toISOString(),
      platformOrderNo: platformId || undefined,
      ledgerOrderId: zfmLedgerOrderId(orderNo),
    });

    return NextResponse.json({
      ok: true,
      orderNo,
      payUrl,
      /** 应付（含 3% 手续费） */
      amountYuan: payYuanStr,
      amountFen: payFen,
      /** 到账 */
      creditYuan: creditYuanStr,
      creditFen,
      feeBps: 10300,
      notifyUrlConfigured: !usingPlaceholderNotify,
      usingPlaceholderNotify,
      localMockOnly,
      mockNotifyEnabled: cfg.mockNotifyEnabled,
      tip: cfg.mockNotifyEnabled
        ? usingPlaceholderNotify || localMockOnly
          ? "本地已开模拟回调：付完后（或跳过真实支付）点「模拟回调」到账"
          : "本地已开模拟回调；若公网 notify 未达，仍可用「模拟回调」"
        : undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "创建支付订单失败";
    console.error("[zfm/create]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
