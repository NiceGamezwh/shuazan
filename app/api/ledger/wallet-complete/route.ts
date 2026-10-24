import { NextRequest, NextResponse } from "next/server";
import { Interface, id } from "ethers";
import { extractBearerToken, verifySessionToken } from "@/lib/auth";
import {
  describeLedgerError,
  getLedgerConfig,
  getLedgerContract,
  getLedgerProvider,
  hashUsername,
  PLATFORM_LEDGER_ABI,
} from "@/lib/ledger";
import { fenToYuanStr, walletPayFen } from "@/lib/recharge-pricing";

export const runtime = "nodejs";

const iface = new Interface([...PLATFORM_LEDGER_ABI]);

/**
 * POST /api/ledger/wallet-complete
 * After user depositUSDTToAccount with 9-折 USDT, operator tops up shortfall so
 * credited balance equals user-declared creditFen.
 *
 * body: { creditFen: number, depositTxHash: string }
 */
export async function POST(request: NextRequest) {
  const token = extractBearerToken(request.headers.get("authorization"));
  const session = verifySessionToken(token);
  if (!session?.username) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
  }

  const { contractAddress, operatorPrivateKey } = getLedgerConfig();
  if (!contractAddress || !operatorPrivateKey) {
    return NextResponse.json(
      { ok: false, error: "充值服务暂未配置" },
      { status: 500 },
    );
  }

  let body: { creditFen?: number | string; depositTxHash?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "请求体必须是 JSON" }, { status: 400 });
  }

  const creditFen = Math.floor(Number(body.creditFen));
  const depositTxHash = String(body.depositTxHash || "").trim();
  if (!Number.isFinite(creditFen) || creditFen <= 0) {
    return NextResponse.json({ ok: false, error: "到账金额无效" }, { status: 400 });
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(depositTxHash)) {
    return NextResponse.json({ ok: false, error: "交易哈希无效" }, { status: 400 });
  }

  const userId = hashUsername(session.username);
  const expectedPayFen = walletPayFen(creditFen);

  try {
    const provider = await getLedgerProvider();
    const receipt = await provider.getTransactionReceipt(depositTxHash);
    if (!receipt || receipt.status !== 1) {
      return NextResponse.json({ ok: false, error: "充值交易未确认或不存在" }, { status: 400 });
    }

    let eventRmbFen = BigInt(0);
    let eventUsdt = BigInt(0);
    let matched = false;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== contractAddress.toLowerCase()) continue;
      try {
        const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
        if (!parsed || parsed.name !== "UsdtDepositedToAccount") continue;
        const evUser = String(parsed.args.userId ?? parsed.args[0]).toLowerCase();
        if (evUser !== userId.toLowerCase()) continue;
        eventUsdt = BigInt(parsed.args.usdtAmount ?? parsed.args[2]);
        eventRmbFen = BigInt(parsed.args.rmbFen ?? parsed.args[3]);
        matched = true;
        break;
      } catch {
        /* not our event */
      }
    }

    if (!matched) {
      return NextResponse.json(
        { ok: false, error: "未在交易中找到本人充值记录" },
        { status: 400 },
      );
    }

    if (eventRmbFen <= BigInt(0)) {
      return NextResponse.json({ ok: false, error: "链上入账金额无效" }, { status: 400 });
    }

    // 允许合约向下取整导致的少记；应付人民币分大约为 expectedPayFen
    // 若链上入账远大于声明到账，拒绝补差（防滥用）
    if (eventRmbFen > BigInt(creditFen)) {
      return NextResponse.json({
        ok: true,
        creditFen,
        creditedOnChainFen: eventRmbFen.toString(),
        bonusFen: 0,
        message: "链上已入账不低于到账额，无需补差",
      });
    }

    // 链上入账应接近 9 折：若明显高于声明到账的 95%，可能用户付了全额——仍只补到 creditFen
    const bonusFen = BigInt(creditFen) - eventRmbFen;
    if (bonusFen <= BigInt(0)) {
      return NextResponse.json({
        ok: true,
        creditFen,
        creditedOnChainFen: eventRmbFen.toString(),
        bonusFen: 0,
        usdtAmount: eventUsdt.toString(),
        expectedPayFen,
      });
    }

    // 补差上限：不超过到账的 15%（9 折理论补 10%，留余量）
    const maxBonus = (BigInt(creditFen) * BigInt(15)) / BigInt(100) + BigInt(2);
    if (bonusFen > maxBonus) {
      return NextResponse.json(
        {
          ok: false,
          error: "链上入账与应付差额异常，请联系客服",
          creditedOnChainFen: eventRmbFen.toString(),
          creditFen,
          expectedPayFen,
        },
        { status: 400 },
      );
    }

    const contract = await getLedgerContract(true);
    const bonusOrderId = id(`wallet-bonus:${depositTxHash}`);
    const used: boolean = await contract.usedOrderIds(bonusOrderId);
    let bonusTxHash: string | null = null;
    if (!used) {
      const tx = await contract.depositByAdmin(userId, bonusFen, bonusOrderId);
      const br = await tx.wait();
      bonusTxHash = br?.hash ?? tx.hash;
    }

    return NextResponse.json({
      ok: true,
      creditFen,
      creditYuan: fenToYuanStr(creditFen),
      creditedOnChainFen: eventRmbFen.toString(),
      bonusFen: bonusFen.toString(),
      bonusTxHash,
      depositTxHash,
      expectedPayFen,
      usdtAmount: eventUsdt.toString(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: describeLedgerError(e) },
      { status: 502 },
    );
  }
}
