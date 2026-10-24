import catalog from "@/components/douyin-products.json";

/**
 * Catalog list-price multiplier vs upstream cost (GoodsPrice).
 * 标价 = 成本 × 3；会员折扣 bps 作用在标价上，等价相对成本：
 * none 3.0 / basic 2.7 / gold 2.4 / diamond 1.8 / supreme 1.5（见 lib/membership.ts）。
 */
export const PRICE_MULTIPLIER = 3;

export type CatalogProduct = {
  id: number;
  name: string;
  /** Upstream raw unit price in RMB (before ×3). */
  rawPrice: number;
  /** Display / charge unit price in RMB (= raw × PRICE_MULTIPLIER). */
  displayPrice: number;
  min: number;
  max: number;
  isClose: number;
};

const products: CatalogProduct[] = (
  (catalog as { info?: Array<Record<string, unknown>> }).info || []
).map((item) => {
  const rawPrice = Number(item.GoodsPrice || 0);
  return {
    id: Number(item.Id),
    name: String(item.GoodsName || ""),
    rawPrice: Number.isFinite(rawPrice) ? rawPrice : 0,
    displayPrice: (Number.isFinite(rawPrice) ? rawPrice : 0) * PRICE_MULTIPLIER,
    min: Number(item.MinOrderNum || 1),
    max: Number(item.MaxOrderNum || item.MinOrderNum || 1),
    isClose: Number(item.IsClose || 2),
  };
});

const byId = new Map(products.map((p) => [p.id, p]));

export function getProductById(goodsId: number): CatalogProduct | null {
  return byId.get(goodsId) ?? null;
}

/**
 * Catalog list charge in fen at display price (成本×3).
 * Membership discounts applied later via applyDiscountFen / getPriceAfterDiscount.
 * Rounds to nearest fen: Math.round(displayPrice * qty * 100).
 */
export function calcChargeFen(goodsId: number, quantity: number): {
  product: CatalogProduct;
  amountFen: bigint;
  displayTotalRmb: number;
} {
  const product = getProductById(goodsId);
  if (!product) throw new Error(`商品不存在: ${goodsId}`);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("quantity 无效");
  }
  const displayTotalRmb = product.displayPrice * quantity;
  const amountFen = BigInt(Math.round(displayTotalRmb * 100));
  if (amountFen <= BigInt(0)) throw new Error("应付金额无效");
  return { product, amountFen, displayTotalRmb };
}
