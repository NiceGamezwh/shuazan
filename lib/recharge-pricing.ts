/**
 * Recharge pricing (user input = credit / 到账金额 in RMB).
 * - Alipay: payFen = ceil(creditFen * 103 / 100)  // +3% fee
 * - Wallet: payFen = floor(creditFen * 90 / 100)  // 10% off; min 1 fen if credit>0
 * Internal USDT conversion still uses rateScaled; do not show rate to users.
 */

export const ALIPAY_FEE_NUM = 103n;
export const ALIPAY_FEE_DEN = 100n;
export const WALLET_PAY_NUM = 90n;
export const WALLET_PAY_DEN = 100n;

export function parseYuanToFen(input: unknown): number {
  const raw = String(input ?? "").trim();
  if (!raw || !/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error("金额须为正数人民币元，最多两位小数");
  }
  const [whole, frac = ""] = raw.split(".");
  const fenFrac = (frac + "00").slice(0, 2);
  const fen = Number(whole) * 100 + Number(fenFrac);
  if (!Number.isFinite(fen) || fen <= 0) throw new Error("金额必须大于 0");
  if (fen > 100_000_000) throw new Error("单笔充值过大");
  return fen;
}

export function fenToYuanStr(fen: number | bigint): string {
  const n = typeof fen === "bigint" ? Number(fen) : fen;
  if (!Number.isFinite(n) || n < 0) return "0.00";
  return `${Math.floor(n / 100)}.${String(n % 100).padStart(2, "0")}`;
}

/** 支付宝应付分：到账分 × 1.03，向上取整到分 */
export function alipayPayFen(creditFen: number): number {
  const c = BigInt(Math.floor(creditFen));
  if (c <= 0n) return 0;
  return Number((c * ALIPAY_FEE_NUM + ALIPAY_FEE_DEN - 1n) / ALIPAY_FEE_DEN);
}

/** 钱包应付人民币分（折后）：到账分 × 0.9，向下取整；至少 1 分 */
export function walletPayFen(creditFen: number): number {
  const c = BigInt(Math.floor(creditFen));
  if (c <= 0n) return 0;
  const pay = (c * WALLET_PAY_NUM) / WALLET_PAY_DEN;
  return Number(pay > 0n ? pay : 1n);
}

export function tryParseYuanToFen(input: unknown): number {
  try {
    return parseYuanToFen(input);
  } catch {
    return 0;
  }
}
