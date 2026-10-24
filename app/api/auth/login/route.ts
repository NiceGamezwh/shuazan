import { NextRequest, NextResponse } from "next/server";
import { createSessionToken } from "@/lib/auth";
import {
  describeLedgerError,
  getLedgerConfig,
  getLedgerContract,
  hashUsername,
} from "@/lib/ledger";

export const runtime = "nodejs";

type LoginBody = {
  username?: string;
  password?: string;
};

/**
 * Previous PlatformLedger on Sepolia (users registered here are NOT on the current contract).
 * Deployed ~2026-10-23 16:10 UTC; superseded by 0xe299… at 16:34 UTC.
 */
const PREVIOUS_LEDGER_CONTRACT = "0x8c6E1508D9e53121B9EC663a48d3e97eabd7C92d";

export async function POST(request: NextRequest) {
  const { contractAddress } = getLedgerConfig();
  if (!contractAddress) {
    return NextResponse.json(
      { ok: false, error: "缺少 LEDGER_CONTRACT_ADDRESS" },
      { status: 500 },
    );
  }

  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return NextResponse.json({ ok: false, error: "请求体必须是 JSON" }, { status: 400 });
  }

  const username = String(body.username ?? "").trim();
  // Do NOT trim password — must match registration byte-for-byte
  const password = String(body.password ?? "");
  if (!username || !password) {
    return NextResponse.json(
      { ok: false, error: "请提供 username 和 password" },
      { status: 400 },
    );
  }

  try {
    const contract = await getLedgerContract(false);
    const usernameHash = hashUsername(username);
    const registered: boolean = await contract.isRegistered(usernameHash);

    if (!registered) {
      const switched =
        contractAddress.toLowerCase() !== PREVIOUS_LEDGER_CONTRACT.toLowerCase();
      return NextResponse.json(
        {
          ok: false,
          code: "NOT_REGISTERED",
          error: switched
            ? "账号未注册或需重新注册，请先完成注册后再登录。"
            : "账号未注册，请先注册",
          contractAddress,
          usernameHash,
        },
        { status: 401 },
      );
    }

    const ok: boolean = await contract.verifyLogin(username, password);
    if (!ok) {
      return NextResponse.json(
        {
          ok: false,
          code: "WRONG_PASSWORD",
          error: "密码错误",
          contractAddress,
          usernameHash,
        },
        { status: 401 },
      );
    }

    const balanceFen: bigint = await contract.balanceOf(usernameHash);
    const token = createSessionToken(username);
    return NextResponse.json({
      ok: true,
      username,
      usernameHash,
      balanceFen: balanceFen.toString(),
      token,
      contractAddress,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: describeLedgerError(error) },
      { status: 502 },
    );
  }
}
