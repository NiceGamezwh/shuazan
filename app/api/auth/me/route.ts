import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, verifySessionToken } from "@/lib/auth";
import {
  describeLedgerError,
  getLedgerConfig,
  getLedgerContract,
  hashUsername,
} from "@/lib/ledger";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { contractAddress } = getLedgerConfig();
  if (!contractAddress) {
    return NextResponse.json(
      { ok: false, error: "缺少 LEDGER_CONTRACT_ADDRESS" },
      { status: 500 },
    );
  }

  const token =
    extractBearerToken(request.headers.get("authorization")) ||
    request.nextUrl.searchParams.get("token")?.trim() ||
    null;
  const session = verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ ok: false, error: "未登录或 token 无效" }, { status: 401 });
  }

  try {
    const usernameHash = hashUsername(session.username);
    const contract = await getLedgerContract(false);
    const [registered, balanceFen] = await Promise.all([
      contract.isRegistered(usernameHash) as Promise<boolean>,
      contract.balanceOf(usernameHash) as Promise<bigint>,
    ]);
    if (!registered) {
      return NextResponse.json({ ok: false, error: "用户未注册" }, { status: 401 });
    }
    return NextResponse.json({
      ok: true,
      username: session.username,
      usernameHash,
      balanceFen: balanceFen.toString(),
      exp: session.exp,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: describeLedgerError(error) },
      { status: 502 },
    );
  }
}
