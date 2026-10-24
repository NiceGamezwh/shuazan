/**
 * Permanent on-chain membership.
 *
 * Catalog display/charge price is stored as cost × 3 (list price).
 * Membership applies discountBps on that list price, equivalent cost multipliers:
 *   guest / none → ×3.0 (bps 10000)
 *   basic        → ×2.7 (bps 9000)
 *   gold         → ×2.4 (bps 8000)
 *   diamond      → ×1.8 (bps 6000)
 *   supreme      → ×1.5 (bps 5000)
 *
 * Upgrade charge (on-chain): listPrice(new) − listPrice(current); current=None → full price.
 */

export type MembershipLevel = 0 | 1 | 2 | 3 | 4;

export type MembershipTier = {
  level: MembershipLevel;
  id: "none" | "basic" | "gold" | "diamond" | "supreme";
  name: string;
  /** List / sticker price in fen (0 for none). */
  priceFen: number;
  /** Display list price in yuan, e.g. 9.9 */
  priceYuan: string;
  /**
   * Basis points on catalog list price (cost×3): final = list × bps / 10000.
   * 10000 = 原价(成本×3).
   */
  discountBps: number;
  /** Equivalent multiplier vs upstream cost (list = cost×3). */
  costMultiplier: number;
  /** Human discount label */
  discountLabel: string;
  perkShort: string;
  perkLong?: string;
};

/** Base catalog multiplier vs cost for guests / non-members. */
export const BASE_COST_MULTIPLIER = 3;

export const MEMBERSHIP_TIERS: MembershipTier[] = [
  {
    level: 0,
    id: "none",
    name: "未开通",
    priceFen: 0,
    priceYuan: "0",
    discountBps: 10000,
    costMultiplier: 3.0,
    discountLabel: "原价（无折扣）",
    perkShort: "未开通会员按原价结算",
  },
  {
    level: 1,
    id: "basic",
    name: "普通会员",
    priceFen: 990,
    priceYuan: "9.9",
    discountBps: 9000,
    costMultiplier: 2.7,
    discountLabel: "永久9折",
    perkShort: "全站商品永久9折",
  },
  {
    level: 2,
    id: "gold",
    name: "黄金会员",
    priceFen: 3990,
    priceYuan: "39.9",
    discountBps: 8000,
    costMultiplier: 2.4,
    discountLabel: "永久8折",
    perkShort: "全站商品永久8折",
  },
  {
    level: 3,
    id: "diamond",
    name: "钻石会员",
    priceFen: 9900,
    priceYuan: "99",
    discountBps: 6000,
    costMultiplier: 1.8,
    discountLabel: "永久6折",
    perkShort: "全站商品永久6折",
  },
  {
    level: 4,
    id: "supreme",
    name: "至尊会员",
    priceFen: 39900,
    priceYuan: "399",
    discountBps: 5000,
    costMultiplier: 1.5,
    discountLabel: "永久5折",
    perkShort: "永久5折 + 整站交付权益",
    perkLong: [
      "含本平台永久5折优惠定价",
      "赠送本平台源码 + 技术人员重新搭建的一次性技术服务",
      "可自定义新品牌名和品牌 logo",
      "重新对接用户自己的收款方式",
      "赠送永久服务器，不收费",
      "这不是普通的搭建分站，而是直接将项目卖给你",
      "后续自行运营即可",
    ].join("\n"),
  },
];

export function getTier(level: number): MembershipTier {
  const n = Number(level);
  const found = MEMBERSHIP_TIERS.find((t) => t.level === n);
  return found ?? MEMBERSHIP_TIERS[0];
}

export function discountBpsForLevel(level: number): number {
  return getTier(level).discountBps;
}

export function costMultiplierForLevel(level: number): number {
  return getTier(level).costMultiplier;
}

/**
 * Apply membership discount to catalog list-price fen (already cost×3).
 * Rounds down — matches Solidity getPriceAfterDiscount.
 * Guests / level 0 → identity (×3.0 stay).
 */
export function applyDiscountFen(
  listFen: bigint | number | string,
  discountBps: number,
): bigint {
  const fen = typeof listFen === "bigint" ? listFen : BigInt(String(listFen));
  const bps = BigInt(Math.floor(discountBps));
  if (bps <= BigInt(0)) return fen;
  if (bps >= BigInt(10000)) return fen;
  return (fen * bps) / BigInt(10000);
}

/**
 * Upgrade differential in fen: list(new) − list(current).
 * currentLevel=0 → full list price of newLevel.
 */
export function upgradePriceFen(currentLevel: number, newLevel: number): number {
  const cur = Math.max(0, Math.floor(Number(currentLevel) || 0));
  const nxt = Math.floor(Number(newLevel) || 0);
  if (nxt <= cur || nxt < 1 || nxt > 4) return 0;
  return getTier(nxt).priceFen - getTier(cur).priceFen;
}

export function fenToYuanLabel(fen: number | bigint | string): string {
  const n = typeof fen === "bigint" ? Number(fen) : Number(fen);
  if (!Number.isFinite(n)) return "0";
  const yuan = n / 100;
  if (Number.isInteger(yuan)) return String(yuan);
  const one = Math.round(yuan * 10) / 10;
  if (Math.abs(yuan - one) < 1e-9) return one.toFixed(1);
  return yuan.toFixed(2);
}
