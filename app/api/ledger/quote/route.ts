import { NextRequest, NextResponse } from "next/server";
import { parseUnits } from "ethers";
import {
  describeLedgerError,
  getLedgerConfig,
  getLedgerContract,
} from "@/lib/ledger";

export const runtime = "nodejs";

/**
 * GET /api/ledger/quote?usdt=1.5
 * POST /api/ledger/quote { "usdt": "1.5" } or { "usdtAmount": "1500000" } (raw 6dec)
 */
export async function GET(request: NextRequest) {
  return quote(request.nextUrl.searchParams.get("usdt"), null);
}

export async function POST(request: NextRequest) {
  let body: { usdt?: string; usdtAmount?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "请求体必须是 JSON" }, { status: 400 });
  }
  return quote(body.usdt ?? null, body.usdtAmount ?? null);
}

async function quote(usdtHuman: string | null, usdtRaw: string | null) {
  const { contractAddress } = getLedgerConfig();
  if (!contractAddress) {
    return NextResponse.json(
      { ok: false, error: "缺少 LEDGER_CONTRACT_ADDRESS" },
      { status: 500 },
    );
  }

  try {
    const contract = await getLedgerContract(false);
    const [rateScaled, usdtDecimals] = await Promise.all([
      contract.rateScaled() as Promise<bigint>,
      contract.usdtDecimals() as Promise<number>,
    ]);
    const decimals = Number(usdtDecimals) || 6;

    let amount: bigint = BigInt(0);
    if (usdtRaw != null && String(usdtRaw).trim()) {
      const s = String(usdtRaw).trim();
      if (!/^\d+$/.test(s)) {
        return NextResponse.json({ ok: false, error: "usdtAmount 须为整数（最小单位）" }, { status: 400 });
      }
      amount = BigInt(s);
    } else if (usdtHuman != null && String(usdtHuman).trim()) {
      const h = String(usdtHuman).trim();
      if (!/^\d+(\.\d+)?$/.test(h)) {
        return NextResponse.json({ ok: false, error: "usdt 数量格式无效" }, { status: 400 });
      }
      amount = parseUnits(h, decimals);
    }

    const rmbFen: bigint =
      amount > BigInt(0) ? ((await contract.quoteUsdtToFen(amount)) as bigint) : BigInt(0);

    return NextResponse.json({
      ok: true,
      usdtAmount: amount.toString(),
      rmbFen: rmbFen.toString(),
      rateScaled: rateScaled.toString(),
      rateHuman: (Number(rateScaled) / 100).toFixed(2),
      usdtDecimals: decimals,
      yuan: (Number(rmbFen) / 100).toFixed(2),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: describeLedgerError(error) },
      { status: 502 },
    );
  }
}
