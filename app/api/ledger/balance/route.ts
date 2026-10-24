import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, verifySessionToken } from "@/lib/auth";
import {
  describeLedgerError,
  getLedgerConfig,
  getLedgerContract,
  hashUsername,
  toBytes32Id,
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

  const userIdParam =
    request.nextUrl.searchParams.get("userId")?.trim() ||
    request.nextUrl.searchParams.get("username")?.trim() ||
    session?.username ||
    "";

  if (!userIdParam) {
    return NextResponse.json(
      { ok: false, error: "请提供 query: userId 或 username，或登录 token" },
      { status: 400 },
    );
  }

  try {
    const looksHex = /^0x[0-9a-fA-F]{64}$/.test(userIdParam);
    const userId = looksHex ? toBytes32Id(userIdParam) : hashUsername(userIdParam);
    const contract = await getLedgerContract(false);
    const [balanceFen, registered] = await Promise.all([
      contract.balanceOf(userId) as Promise<bigint>,
      contract.isRegistered(userId).catch(() => false) as Promise<boolean>,
    ]);
    return NextResponse.json({
      ok: true,
      userId,
      input: userIdParam,
      username: session?.username ?? (!looksHex ? userIdParam : undefined),
      registered,
      balanceFen: balanceFen.toString(),
      balanceRmb: (Number(balanceFen) / 100).toFixed(2),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: describeLedgerError(error) },
      { status: 502 },
    );
  }
}
