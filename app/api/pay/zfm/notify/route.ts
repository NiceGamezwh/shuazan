import { NextRequest, NextResponse } from "next/server";
import {
  describeLedgerError,
  getLedgerConfig,
  getLedgerContract,
  hashUsername,
} from "@/lib/ledger";
import {
  findZfmOrder,
  getZfmConfig,
  signNotify,
  upsertZfmOrder,
  zfmLedgerOrderId,
} from "@/lib/zfm";

export const runtime = "nodejs";

/**
 * 支付FM 异步通知（默认 GET Query；也可 POST form）。
 * 验签：md5(state + merchantNum + orderNo + amount + secret)
 * 成功且未处理 → depositByAdmin → 返回纯文本 "success"
 *
 * 文档：https://docs.zhifux.com/read/zhifufm/notify
 */
async function parseNotifyParams(request: NextRequest): Promise<{
  params: Record<string, string>;
  source: string;
}> {
  const sp = request.nextUrl.searchParams;
  const fromQuery: Record<string, string> = {};
  sp.forEach((v, k) => {
    fromQuery[k] = v;
  });

  let fromBody: Record<string, string> = {};
  if (request.method === "POST") {
    const ct = request.headers.get("content-type") || "";
    try {
      if (ct.includes("application/json")) {
        const j = (await request.json()) as Record<string, unknown>;
        for (const [k, v] of Object.entries(j || {})) {
          if (v != null) fromBody[k] = String(v);
        }
      } else {
        const form = await request.formData();
        form.forEach((v, k) => {
          fromBody[k] = String(v);
        });
      }
    } catch {
      fromBody = {};
    }
  }

  const merged = { ...fromBody, ...fromQuery };
  return { params: merged, source: request.method };
}

async function handleNotify(request: NextRequest): Promise<Response> {
  const cfg = getZfmConfig();
  const { params, source } = await parseNotifyParams(request);

  // 联调：完整回调打到服务器日志（不含密钥）
  console.info("[zfm/notify] raw", {
    source,
    keys: Object.keys(params),
    orderNo: params.orderNo,
    amount: params.amount,
    state: params.state,
    merchantNum: params.merchantNum,
    platformOrderNo: params.platformOrderNo,
    actualPayAmount: params.actualPayAmount,
    sign: params.sign ? `${params.sign.slice(0, 8)}…` : "",
  });

  if (!cfg.merchantNum || !cfg.secret) {
    console.error("[zfm/notify] missing merchant config");
    return new Response("fail", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const merchantNum = (params.merchantNum || "").trim();
  const orderNo = (params.orderNo || "").trim();
  const amount = (params.amount || "").trim();
  const state = (params.state || "").trim();
  const sign = (params.sign || "").trim().toLowerCase();

  if (!orderNo || !amount || !sign) {
    console.warn("[zfm/notify] missing fields");
    return new Response("fail", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  if (merchantNum !== cfg.merchantNum) {
    console.warn("[zfm/notify] merchantNum mismatch");
    return new Response("fail", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const expected = signNotify({
    state,
    merchantNum: cfg.merchantNum,
    orderNo,
    amount,
    secret: cfg.secret,
  });
  if (expected !== sign) {
    console.warn("[zfm/notify] bad sign", { expected: expected.slice(0, 8), got: sign.slice(0, 8) });
    return new Response("fail", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  // state=1 付款成功
  if (state !== "1") {
    console.info("[zfm/notify] ignore non-success state", state);
    return new Response("success", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const order = await findZfmOrder(orderNo);
  if (!order) {
    console.warn("[zfm/notify] unknown orderNo", orderNo);
    // 仍返回 success 避免无限重试刷未知单；也可改 fail。此处返回 fail 便于发现丢单。
    return new Response("fail", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  // 校验金额与本地订单一致（元字符串 / 分）
  const amountNorm = normalizeYuanStr(amount);
  const localNorm = normalizeYuanStr(order.amountYuanStr);
  if (amountNorm !== localNorm) {
    // 也允许用分比对（防止 "10" vs "10.00"）
    const cbFen = yuanStrToFen(amount);
    if (cbFen !== order.amountFen) {
      console.warn("[zfm/notify] amount mismatch", {
        callback: amount,
        local: order.amountYuanStr,
      });
      return new Response("fail", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  }

  // 幂等：已处理直接 success
  if (order.status === "paid") {
    return new Response("success", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const { contractAddress, operatorPrivateKey } = getLedgerConfig();
  if (!contractAddress || !operatorPrivateKey) {
    console.error("[zfm/notify] ledger not configured");
    return new Response("fail", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const usernameHash = order.usernameHash || hashUsername(order.username);
  const ledgerOrderId = order.ledgerOrderId || zfmLedgerOrderId(orderNo);

  try {
    const contract = await getLedgerContract(true);
    // 若链上已用过该 orderId，视为已入账
    const used: boolean = await contract.usedOrderIds(ledgerOrderId);
    let txHash = order.txHash;
    if (!used) {
      const creditFen = Number(order.creditFen ?? order.amountFen);
      if (!Number.isFinite(creditFen) || creditFen <= 0) {
        console.error("[zfm/notify] invalid creditFen", order.orderNo, order.creditFen);
        return new Response("fail", {
          status: 500,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      const tx = await contract.depositByAdmin(
        usernameHash,
        BigInt(creditFen),
        ledgerOrderId,
      );
      const receipt = await tx.wait();
      txHash = receipt?.hash ?? tx.hash;
    }

    await upsertZfmOrder({
      ...order,
      status: "paid",
      paidAt: new Date().toISOString(),
      platformOrderNo: params.platformOrderNo || order.platformOrderNo,
      txHash,
      ledgerOrderId,
    });

    console.info("[zfm/notify] credited", {
      orderNo,
      username: order.username,
      amountFen: order.amountFen,
      creditFen: order.creditFen ?? order.amountFen,
      txHash,
    });

    return new Response("success", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch (error) {
    const msg = describeLedgerError(error);
    // orderId 已使用 → 标记 paid 并 success
    if (/OrderAlreadyUsed|orderId 已使用/i.test(msg)) {
      await upsertZfmOrder({
        ...order,
        status: "paid",
        paidAt: order.paidAt || new Date().toISOString(),
        platformOrderNo: params.platformOrderNo || order.platformOrderNo,
        ledgerOrderId,
      });
      return new Response("success", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    console.error("[zfm/notify] deposit failed", msg);
    return new Response("fail", { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

function normalizeYuanStr(s: string): string {
  const n = Number(s);
  if (!Number.isFinite(n)) return s.trim();
  return n.toFixed(2);
}

function yuanStrToFen(s: string): number {
  const n = Number(s);
  if (!Number.isFinite(n)) return -1;
  return Math.round(n * 100);
}

export async function GET(request: NextRequest) {
  return handleNotify(request);
}

export async function POST(request: NextRequest) {
  return handleNotify(request);
}
