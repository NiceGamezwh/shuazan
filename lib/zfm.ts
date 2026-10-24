/**
 * 支付FM（ZFM）服务端工具：签名、配置、本地订单落盘。
 * 密钥仅服务端读取，勿 import 到客户端组件。
 */
import { createHash, randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { id } from "ethers";

export type ZfmOrderStatus = "pending" | "paid" | "failed";

export type ZfmOrder = {
  orderNo: string;
  username: string;
  usernameHash: string;
  /** 用户应付给支付渠道的人民币分（含手续费） */
  amountFen: number;
  /** 请求给支付FM的金额字符串（元），签名必须与此一致 */
  amountYuanStr: string;
  /** 到账人民币分（用户填写的充值金额） */
  creditFen?: number;
  /** 到账人民币元字符串 */
  creditYuanStr?: string;
  status: ZfmOrderStatus;
  createdAt: string;
  paidAt?: string;
  platformOrderNo?: string;
  txHash?: string;
  /** 链上 depositByAdmin 的 orderId = keccak256("zfm:" + orderNo) */
  ledgerOrderId?: string;
};

export type ZfmConfig = {
  apiBase: string;
  merchantNum: string;
  secret: string;
  notifyUrl: string;
  payType: string;
  mockNotifyEnabled: boolean;
};

const ORDERS_PATH = path.join(process.cwd(), "data", "zfm-orders.json");

/** 本地 mock 用占位回调（仅参与签名；真实到账靠 /api/pay/zfm/mock-notify） */
export const ZFM_DEV_PLACEHOLDER_NOTIFY =
  "http://127.0.0.1/api/pay/zfm/notify";

export function getZfmConfig(): ZfmConfig {
  const apiBase = (
    process.env.ZFM_API_BASE?.trim() ||
    "https://api-54kn0m8dooow.zhifu.fm.it88168.com/api"
  ).replace(/\/+$/, "");
  const merchantNum = process.env.ZFM_MERCHANT_NUM?.trim() || "";
  const secret = process.env.ZFM_SECRET?.trim() || "";
  const payType = process.env.ZFM_PAY_TYPE?.trim() || "aloop";

  const mockNotifyEnabled =
    process.env.NODE_ENV === "development" &&
    (process.env.ZFM_MOCK_NOTIFY?.trim() === "1" ||
      process.env.ZFM_MOCK_NOTIFY?.trim()?.toLowerCase() === "true");

  let notifyUrl = process.env.ZFM_NOTIFY_URL?.trim() || "";
  if (!notifyUrl) {
    const publicBase = (
      process.env.PUBLIC_BASE_URL?.trim() ||
      process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
      ""
    ).replace(/\/+$/, "");
    if (publicBase) {
      notifyUrl = `${publicBase}/api/pay/zfm/notify`;
    }
  }

  // 开发 + 模拟回调：无公网 URL 时用占位 notify，避免创建订单直接 500
  if (!notifyUrl && mockNotifyEnabled) {
    notifyUrl = ZFM_DEV_PLACEHOLDER_NOTIFY;
  }

  return {
    apiBase,
    merchantNum,
    secret,
    notifyUrl,
    payType,
    mockNotifyEnabled,
  };
}

/** 当前 notify 是否为本地占位（非公网真实回调） */
export function isZfmPlaceholderNotify(notifyUrl: string): boolean {
  return (
    !notifyUrl ||
    notifyUrl === ZFM_DEV_PLACEHOLDER_NOTIFY ||
    /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(notifyUrl)
  );
}

/** MD5 小写 hex */
export function md5Hex(input: string): string {
  return createHash("md5").update(input, "utf8").digest("hex");
}

/**
 * 创建订单签名：
 * md5(merchantNum + orderNo + amount + notifyUrl + secret)
 * amount 必须与请求里传的金额字符串完全一致。
 */
export function signCreateOrder(params: {
  merchantNum: string;
  orderNo: string;
  amount: string;
  notifyUrl: string;
  secret: string;
}): string {
  const raw =
    params.merchantNum +
    params.orderNo +
    params.amount +
    params.notifyUrl +
    params.secret;
  return md5Hex(raw);
}

/**
 * 异步回调验签（官方文档）：
 * md5(state + merchantNum + orderNo + amount + secret)
 */
export function signNotify(params: {
  state: string;
  merchantNum: string;
  orderNo: string;
  amount: string;
  secret: string;
}): string {
  const raw =
    params.state +
    params.merchantNum +
    params.orderNo +
    params.amount +
    params.secret;
  return md5Hex(raw);
}

/** 链上防重复 orderId：keccak256(utf8("zfm:" + orderNo)) */
export function zfmLedgerOrderId(orderNo: string): string {
  return id(`zfm:${orderNo}`);
}

/** 仅字母数字，建议 ≤32 */
export function generateOrderNo(): string {
  const ts = Date.now().toString(36);
  const rnd = randomBytes(8).toString("hex");
  return `zfm${ts}${rnd}`.slice(0, 32);
}

/**
 * 将用户输入的人民币元规范为两位小数字符串，并返回分。
 * 例如 "10" → { amountYuanStr: "10.00", amountFen: 1000 }
 * "10.5" → "10.50" / 1050；拒绝 >2 位小数。
 */
export function parseAmountYuan(input: unknown): {
  amountYuanStr: string;
  amountFen: number;
} {
  const raw = String(input ?? "").trim();
  if (!raw || !/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error("金额须为正数人民币元，最多两位小数");
  }
  const [whole, frac = ""] = raw.split(".");
  const fenFrac = (frac + "00").slice(0, 2);
  const amountFen = Number(whole) * 100 + Number(fenFrac);
  if (!Number.isFinite(amountFen) || amountFen <= 0) {
    throw new Error("金额必须大于 0");
  }
  if (amountFen > 1_000_000_00) {
    throw new Error("单笔充值过大");
  }
  const amountYuanStr = `${Math.floor(amountFen / 100)}.${String(amountFen % 100).padStart(2, "0")}`;
  return { amountYuanStr, amountFen };
}

async function ensureOrdersFile(): Promise<void> {
  const dir = path.dirname(ORDERS_PATH);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(ORDERS_PATH);
  } catch {
    await fs.writeFile(ORDERS_PATH, "[]\n", "utf8");
  }
}

export async function readZfmOrders(): Promise<ZfmOrder[]> {
  await ensureOrdersFile();
  const raw = await fs.readFile(ORDERS_PATH, "utf8");
  try {
    const parsed = JSON.parse(raw) as ZfmOrder[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeZfmOrders(orders: ZfmOrder[]): Promise<void> {
  await ensureOrdersFile();
  const tmp = `${ORDERS_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(orders, null, 2) + "\n", "utf8");
  await fs.rename(tmp, ORDERS_PATH);
}

export async function upsertZfmOrder(order: ZfmOrder): Promise<void> {
  const orders = await readZfmOrders();
  const idx = orders.findIndex((o) => o.orderNo === order.orderNo);
  if (idx >= 0) orders[idx] = order;
  else orders.unshift(order);
  // 保留最近 500 条
  await writeZfmOrders(orders.slice(0, 500));
}

export async function findZfmOrder(orderNo: string): Promise<ZfmOrder | null> {
  const orders = await readZfmOrders();
  return orders.find((o) => o.orderNo === orderNo) ?? null;
}

/**
 * 调用支付FM startOrder（POST，参数放 Query）。
 */
export async function startZfmOrder(opts: {
  orderNo: string;
  amountYuanStr: string;
  subject?: string;
}): Promise<{ payUrl: string; platformId: string; raw: unknown }> {
  const cfg = getZfmConfig();
  if (!cfg.merchantNum || !cfg.secret) {
    throw new Error("缺少 ZFM_MERCHANT_NUM 或 ZFM_SECRET");
  }
  if (!cfg.notifyUrl) {
    throw new Error(
      "缺少 ZFM_NOTIFY_URL（或 PUBLIC_BASE_URL）。本地开发可设 ZFM_MOCK_NOTIFY=1，或用 ngrok 写入公网回调",
    );
  }

  const sign = signCreateOrder({
    merchantNum: cfg.merchantNum,
    orderNo: opts.orderNo,
    amount: opts.amountYuanStr,
    notifyUrl: cfg.notifyUrl,
    secret: cfg.secret,
  });

  const qs = new URLSearchParams({
    merchantNum: cfg.merchantNum,
    orderNo: opts.orderNo,
    amount: opts.amountYuanStr,
    payType: cfg.payType,
    notifyUrl: cfg.notifyUrl,
    sign,
    returnType: "json",
  });
  if (opts.subject) qs.set("subject", opts.subject);

  const url = `${cfg.apiBase}/startOrder?${qs.toString()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "",
    cache: "no-store",
  });

  let json: {
    success?: boolean;
    msg?: string;
    code?: number;
    data?: { id?: string; payUrl?: string };
  };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    throw new Error(`支付FM 返回非 JSON（HTTP ${res.status}）`);
  }

  if (!json?.success || !json.data?.payUrl) {
    throw new Error(json?.msg || `创建订单失败 code=${json?.code ?? res.status}`);
  }

  return {
    payUrl: String(json.data.payUrl),
    platformId: String(json.data.id || ""),
    raw: json,
  };
}
