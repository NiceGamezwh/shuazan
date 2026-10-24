import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, verifySessionToken } from "@/lib/auth";
import {
  describeLedgerError,
  getLedgerConfig,
  getLedgerContract,
  getMembershipOnChain,
  hashUsername,
  parseOrderId,
} from "@/lib/ledger";
import {
  MEMBERSHIP_TIERS,
  fenToYuanLabel,
  getTier,
  upgradePriceFen,
} from "@/lib/membership";

export const runtime = "nodejs";

function requireSession(request: NextRequest) {
  const token =
    extractBearerToken(request.headers.get("authorization")) ||
    request.nextUrl.searchParams.get("token")?.trim() ||
    null;
  const session = verifySessionToken(token);
  if (!session) return null;
  return session;
}

/** GET: current membership + catalog with upgrade differential prices */
export async function GET(request: NextRequest) {
  const { contractAddress } = getLedgerConfig();
  if (!contractAddress) {
    return NextResponse.json(
      { ok: false, error: "缺少 LEDGER_CONTRACT_ADDRESS" },
      { status: 500 },
    );
  }

  const session = requireSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
  }

  try {
    const userId = hashUsername(session.username);
    const mem = await getMembershipOnChain(userId);
    const contract = await getLedgerContract(false);
    let balanceFen = "0";
    try {
      balanceFen = ((await contract.balanceOf(userId)) as bigint).toString();
    } catch {
      /* ignore */
    }

    const tiers = [];
    for (const t of MEMBERSHIP_TIERS.filter((x) => x.level > 0)) {
      const canPurchase = t.level > mem.level;
      let upgradeFen = canPurchase ? upgradePriceFen(mem.level, t.level) : 0;
      if (canPurchase) {
        try {
          upgradeFen = Number(
            await contract.getMembershipUpgradePrice(userId, t.level),
          );
        } catch {
          /* keep local calc */
        }
      }
      tiers.push({
        level: t.level,
        id: t.id,
        name: t.name,
        priceFen: t.priceFen,
        priceYuan: t.priceYuan,
        discountBps: t.discountBps,
        costMultiplier: t.costMultiplier,
        discountLabel: t.discountLabel,
        perkShort: t.perkShort,
        perkLong: t.perkLong ?? null,
        canPurchase,
        isCurrent: t.level === mem.level,
        upgradePriceFen: upgradeFen,
        upgradePriceYuan: fenToYuanLabel(upgradeFen),
      });
    }

    return NextResponse.json({
      ok: true,
      username: session.username,
      userId,
      level: mem.level,
      discountBps: mem.discountBps,
      costMultiplier: getTier(mem.level).costMultiplier,
      name: mem.name,
      discountLabel: mem.discountLabel,
      balanceFen,
      tiers,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: describeLedgerError(error) },
      { status: 502 },
    );
  }
}

type PurchaseBody = {
  level?: number | string;
  orderId?: string;
};

/** POST: purchase / upgrade (charge = list(new) − list(current)) */
export async function POST(request: NextRequest) {
  const { contractAddress, operatorPrivateKey } = getLedgerConfig();
  if (!contractAddress) {
    return NextResponse.json(
      { ok: false, error: "缺少 LEDGER_CONTRACT_ADDRESS" },
      { status: 500 },
    );
  }
  if (!operatorPrivateKey) {
    return NextResponse.json(
      { ok: false, error: "缺少 LEDGER_OPERATOR_PRIVATE_KEY" },
      { status: 500 },
    );
  }

  const session = requireSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
  }

  let body: PurchaseBody;
  try {
    body = (await request.json()) as PurchaseBody;
  } catch {
    return NextResponse.json({ ok: false, error: "请求体必须是 JSON" }, { status: 400 });
  }

  const level = Number(body.level);
  if (![1, 2, 3, 4].includes(level)) {
    return NextResponse.json(
      { ok: false, error: "level 须为 1–4（普通/黄金/钻石/至尊）" },
      { status: 400 },
    );
  }

  const tier = getTier(level);
  const userId = hashUsername(session.username);
  const orderKey =
    body.orderId?.trim() ||
    `membership:${session.username}:${level}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  const orderId = parseOrderId(orderKey);

  try {
    const contract = await getLedgerContract(true);
    const current: number = Number(await contract.membershipLevel(userId));
    if (level <= current) {
      return NextResponse.json(
        {
          ok: false,
          error: "会员只能升级不能降级",
          currentLevel: current,
          requestedLevel: level,
        },
        { status: 400 },
      );
    }

    let chargeFen: bigint;
    try {
      chargeFen = (await contract.getMembershipUpgradePrice(
        userId,
        level,
      )) as bigint;
    } catch {
      chargeFen = BigInt(upgradePriceFen(current, level));
    }

    const bal: bigint = await contract.balanceOf(userId);
    if (bal < chargeFen) {
      return NextResponse.json(
        {
          ok: false,
          error: "余额不足",
          balanceFen: bal.toString(),
          needFen: chargeFen.toString(),
          listPriceFen: tier.priceFen,
          upgradePriceFen: chargeFen.toString(),
          upgradePriceYuan: fenToYuanLabel(chargeFen),
          priceYuan: fenToYuanLabel(chargeFen),
        },
        { status: 402 },
      );
    }

    const tx = await contract.purchaseMembership(userId, level, orderId);
    const receipt = await tx.wait();
    const mem = await getMembershipOnChain(userId);
    const newBal = ((await contract.balanceOf(userId)) as bigint).toString();

    return NextResponse.json({
      ok: true,
      username: session.username,
      userId,
      level: mem.level,
      discountBps: mem.discountBps,
      costMultiplier: getTier(mem.level).costMultiplier,
      name: mem.name,
      discountLabel: mem.discountLabel,
      listPriceFen: String(tier.priceFen),
      upgradePriceFen: chargeFen.toString(),
      upgradePriceYuan: fenToYuanLabel(chargeFen),
      priceFen: chargeFen.toString(),
      priceYuan: fenToYuanLabel(chargeFen),
      orderId,
      txHash: receipt?.hash ?? tx.hash,
      blockNumber: receipt?.blockNumber ?? null,
      balanceFen: newBal,
    });
  } catch (error) {
    const message = describeLedgerError(error);
    const status =
      message === "余额不足"
        ? 402
        : /请提供|不能为空|必须为|只能升级|无效/.test(message)
          ? 400
          : 502;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
