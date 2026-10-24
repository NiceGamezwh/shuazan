import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, verifySessionToken } from "@/lib/auth";
import {
  describeLedgerError,
  getLedgerConfig,
  hashUsername,
  queryUserLedgerEvents,
  type LedgerEventKind,
} from "@/lib/ledger";

export const runtime = "nodejs";

const KIND_SET = new Set<LedgerEventKind>([
  "Consumed",
  "Deposited",
  "UsdtDepositedToAccount",
]);

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

  if (!session?.username) {
    return NextResponse.json(
      { ok: false, error: "请先登录后再查看订单记录" },
      { status: 401 },
    );
  }

  const usernameQ = request.nextUrl.searchParams.get("username")?.trim() || "";
  if (usernameQ && usernameQ !== session.username) {
    return NextResponse.json(
      { ok: false, error: "只能查看当前登录账号的记录" },
      { status: 403 },
    );
  }

  const username = session.username;
  const usernameHash = hashUsername(username);

  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = limitRaw && /^\d+$/.test(limitRaw) ? Number(limitRaw) : 50;

  const typeParam = request.nextUrl.searchParams.get("type")?.trim() || "all";
  let kinds: LedgerEventKind[] | undefined;
  if (typeParam === "consume" || typeParam === "Consumed") {
    kinds = ["Consumed"];
  } else if (typeParam === "deposit" || typeParam === "Deposited") {
    kinds = ["Deposited", "UsdtDepositedToAccount"];
  } else if (KIND_SET.has(typeParam as LedgerEventKind)) {
    kinds = [typeParam as LedgerEventKind];
  }

  try {
    const result = await queryUserLedgerEvents({
      usernameHash,
      limit,
      kinds,
    });
    return NextResponse.json({
      ok: true,
      username,
      usernameHash: result.usernameHash,
      contractAddress,
      fromBlock: result.fromBlock,
      toBlock: result.toBlock,
      fromBlockSource: result.fromBlockSource,
      count: result.events.length,
      events: result.events,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: describeLedgerError(error),
        events: [],
        count: 0,
      },
      { status: 502 },
    );
  }
}
