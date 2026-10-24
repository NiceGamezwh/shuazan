import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, verifySessionToken } from "@/lib/auth";
import {
  describeLedgerError,
  getLedgerConfig,
  getLedgerContract,
  getMembershipOnChain,
  hashUsername,
  toBytes32Id,
} from "@/lib/ledger";
import { applyDiscountFen } from "@/lib/membership";
import { calcChargeFen } from "@/lib/products";
import {
  buildCreateOrderBody,
  describeFetchError,
  getCreateOrderHeaders,
  getXysq3Config,
  xysq3Fetch,
  type OrderParamInput,
} from "@/lib/xysq3";

export const runtime = "nodejs";

type OrderRequestBody = {
  goodsId?: number | string;
  quantity?: number | string;
  params?: OrderParamInput[];
  /** Optional; ignored if Authorization Bearer present. */
  token?: string;
  username?: string;
};

type UpstreamItem = {
  error?: number;
  msg?: string;
};

function parseInfoItems(info: unknown): UpstreamItem[] {
  if (info == null) return [];
  if (Array.isArray(info)) return info as UpstreamItem[];
  if (typeof info === "string") {
    try {
      const parsed = JSON.parse(info);
      return Array.isArray(parsed) ? (parsed as UpstreamItem[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function extractUpstreamMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as { info?: unknown; message?: unknown; msg?: unknown };
  const items = parseInfoItems(payload.info);
  const msgs = items
    .map((item) => (typeof item.msg === "string" ? item.msg : ""))
    .filter(Boolean);
  if (msgs.length > 0) return msgs.join("；");
  if (typeof payload.info === "string" && payload.info.trim()) return payload.info;
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  if (typeof payload.msg === "string" && payload.msg.trim()) return payload.msg;
  return null;
}

function isCreateOrderSuccess(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const payload = data as { error?: number; info?: unknown };
  if (payload.error !== 0) return false;
  const items = parseInfoItems(payload.info);
  if (items.length === 0) return true;
  return items.every((item) => item.error === 0);
}

export async function POST(request: NextRequest) {
  const { baseUrl, token: xysq3Token, proxyUrl } = getXysq3Config();
  const { contractAddress, operatorPrivateKey } = getLedgerConfig();

  if (!xysq3Token) {
    return NextResponse.json(
      { ok: false, error: "缺少 XYSQ3_ACCESS_TOKEN，请在 .env.local 配置" },
      { status: 500 },
    );
  }
  if (!contractAddress || !operatorPrivateKey) {
    return NextResponse.json(
      { ok: false, error: "支付服务暂未配置，请稍后重试或联系管理员" },
      { status: 500 },
    );
  }

  let body: OrderRequestBody;
  try {
    body = (await request.json()) as OrderRequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "请求体必须是 JSON" }, { status: 400 });
  }

  const sessionToken =
    extractBearerToken(request.headers.get("authorization")) ||
    (body.token ? String(body.token).trim() : null);
  const session = verifySessionToken(sessionToken);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "请先登录后再下单" },
      { status: 401 },
    );
  }
  const username = session.username;

  const goodsId = Number(body.goodsId);
  const quantity = Number(body.quantity);
  const params = Array.isArray(body.params) ? body.params : [];

  if (!Number.isFinite(goodsId) || goodsId <= 0) {
    return NextResponse.json({ ok: false, error: "goodsId 无效" }, { status: 400 });
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ ok: false, error: "quantity 无效" }, { status: 400 });
  }
  if (params.some((param) => !param?.name || !param?.key || !String(param.value ?? "").trim())) {
    return NextResponse.json({ ok: false, error: "下单参数不完整" }, { status: 400 });
  }

  let listAmountFen: bigint;
  let amountFen: bigint;
  let displayTotalRmb: number;
  let discountedTotalRmb: number;
  let productName: string;
  let membershipLevel = 0;
  let discountBps = 10000;
  try {
    const charged = calcChargeFen(goodsId, quantity);
    listAmountFen = charged.amountFen;
    displayTotalRmb = charged.displayTotalRmb;
    productName = charged.product.name;
    if (charged.product.isClose === 1) {
      return NextResponse.json({ ok: false, error: "该商品暂停购买" }, { status: 400 });
    }
    if (quantity < charged.product.min || quantity > charged.product.max) {
      return NextResponse.json(
        {
          ok: false,
          error: `数量需在 ${charged.product.min} — ${charged.product.max} 之间`,
        },
        { status: 400 },
      );
    }
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "计价失败" },
      { status: 400 },
    );
  }

  const userId = hashUsername(username);
  try {
    const mem = await getMembershipOnChain(userId);
    membershipLevel = mem.level;
    discountBps = mem.discountBps;
  } catch {
    membershipLevel = 0;
    discountBps = 10000;
  }
  amountFen = applyDiscountFen(listAmountFen, discountBps);
  if (amountFen <= BigInt(0)) {
    return NextResponse.json({ ok: false, error: "折后应付金额无效" }, { status: 400 });
  }
  discountedTotalRmb = Number(amountFen) / 100;

  const consumeOrderKey = `consume:${username}:${goodsId}:${quantity}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  const consumeOrderId = toBytes32Id(consumeOrderKey);
  const refundOrderKey = `refund:${consumeOrderKey}`;
  const refundOrderId = toBytes32Id(refundOrderKey);

  let consumeTxHash: string | null = null;

  try {
    const contract = await getLedgerContract(true);
    const bal: bigint = await contract.balanceOf(userId);
    if (bal < amountFen) {
      return NextResponse.json(
        {
          ok: false,
          error: "余额不足",
          balanceFen: bal.toString(),
          needFen: amountFen.toString(),
          listFen: listAmountFen.toString(),
          displayTotalRmb,
          discountedTotalRmb,
          membershipLevel,
          discountBps,
        },
        { status: 402 },
      );
    }

    const consumeTx = await contract.consume(userId, amountFen, consumeOrderId);
    const consumeReceipt = await consumeTx.wait();
    consumeTxHash = consumeReceipt?.hash ?? consumeTx.hash;
  } catch (error) {
    const message = describeLedgerError(error);
    const status = message === "余额不足" ? 402 : 502;
    return NextResponse.json({ ok: false, error: message }, { status });
  }

  const form = buildCreateOrderBody({
    goodsId,
    quantity,
    params: params.map((param) => ({
      name: String(param.name),
      key: String(param.key),
      value: String(param.value ?? "").trim(),
      type: param.type != null ? Number(param.type) : undefined,
    })),
  });

  try {
    const upstream = await xysq3Fetch(`${baseUrl}/api/createOrder`, {
      method: "POST",
      headers: getCreateOrderHeaders(xysq3Token),
      body: new URLSearchParams(form).toString(),
      cache: "no-store",
    });

    const text = await upstream.text();
    let data: unknown = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!upstream.ok || !isCreateOrderSuccess(data)) {
      const upstreamMessage = extractUpstreamMessage(data) || `xysq3 HTTP ${upstream.status}`;
      let refundTxHash: string | null = null;
      let refundError: string | null = null;
      try {
        const contract = await getLedgerContract(true);
        const refundTx = await contract.depositByAdmin(userId, amountFen, refundOrderId);
        const refundReceipt = await refundTx.wait();
        refundTxHash = refundReceipt?.hash ?? refundTx.hash;
      } catch (refundErr) {
        refundError = describeLedgerError(refundErr);
      }
      return NextResponse.json(
        {
          ok: false,
          error: upstreamMessage,
          consumeTxHash,
          refunded: Boolean(refundTxHash),
          refundTxHash,
          refundError,
          amountFen: amountFen.toString(),
          displayTotalRmb,
          productName,
          upstream: data,
        },
        { status: 502 },
      );
    }

    let balanceFen: string | null = null;
    try {
      const contract = await getLedgerContract(false);
      balanceFen = ((await contract.balanceOf(userId)) as bigint).toString();
    } catch {
      balanceFen = null;
    }

    return NextResponse.json({
      ok: true,
      error: null,
      username,
      goodsId,
      quantity,
      amountFen: amountFen.toString(),
      listAmountFen: listAmountFen.toString(),
      displayTotalRmb,
      discountedTotalRmb,
      membershipLevel,
      discountBps,
      productName,
      consumeTxHash,
      consumeOrderId,
      balanceFen,
      upstream: data,
    });
  } catch (error) {
    const message = describeFetchError(error);
    let refundTxHash: string | null = null;
    let refundError: string | null = null;
    try {
      const contract = await getLedgerContract(true);
      const refundTx = await contract.depositByAdmin(userId, amountFen, refundOrderId);
      const refundReceipt = await refundTx.wait();
      refundTxHash = refundReceipt?.hash ?? refundTx.hash;
    } catch (refundErr) {
      refundError = describeLedgerError(refundErr);
    }
    return NextResponse.json(
      {
        ok: false,
        error: message,
        consumeTxHash,
        refunded: Boolean(refundTxHash),
        refundTxHash,
        refundError,
        proxyConfigured: Boolean(proxyUrl),
      },
      { status: 502 },
    );
  }
}
