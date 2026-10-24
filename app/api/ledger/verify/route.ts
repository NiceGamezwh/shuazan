import { NextResponse } from "next/server";
import {
  describeLedgerError,
  getLedgerConfig,
  verifyLedgerOnChain,
} from "@/lib/ledger";

export const runtime = "nodejs";

/** Read-only on-chain sanity check (operator / usdt / rate / paused / auth). */
export async function GET() {
  const { contractAddress } = getLedgerConfig();
  if (!contractAddress) {
    return NextResponse.json(
      { ok: false, error: "缺少 LEDGER_CONTRACT_ADDRESS" },
      { status: 500 },
    );
  }

  try {
    const result = await verifyLedgerOnChain();
    return NextResponse.json({ contractAddress, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: describeLedgerError(error) },
      { status: 502 },
    );
  }
}

