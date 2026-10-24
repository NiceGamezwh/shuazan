import { NextRequest, NextResponse } from "next/server";
import { createSessionToken } from "@/lib/auth";
import {
  describeLedgerError,
  getLedgerConfig,
  getLedgerContract,
  hashPassword,
  hashUsername,
} from "@/lib/ledger";

export const runtime = "nodejs";

type RegisterBody = {
  username?: string;
  password?: string;
};

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

  let body: RegisterBody;
  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ ok: false, error: "请求体必须是 JSON" }, { status: 400 });
  }

  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  if (!username) {
    return NextResponse.json({ ok: false, error: "username 不能为空" }, { status: 400 });
  }
  if (!password) {
    return NextResponse.json({ ok: false, error: "password 不能为空" }, { status: 400 });
  }
  if (username.length > 64 || password.length > 128) {
    return NextResponse.json({ ok: false, error: "用户名或密码过长" }, { status: 400 });
  }

  try {
    const usernameHash = hashUsername(username);
    const passwordHash = hashPassword(username, password);
    const contract = await getLedgerContract(true);

    const already: boolean = await contract.isRegistered(usernameHash);
    if (already) {
      return NextResponse.json({ ok: false, error: "用户名已注册" }, { status: 409 });
    }

    const tx = await contract.registerUser(usernameHash, passwordHash);
    const receipt = await tx.wait();
    const token = createSessionToken(username);

    return NextResponse.json({
      ok: true,
      contractAddress,
      username,
      usernameHash,
      txHash: receipt?.hash ?? tx.hash,
      blockNumber: receipt?.blockNumber ?? null,
      token,
    });
  } catch (error) {
    const message = describeLedgerError(error);
    const status = /已注册|不能为空|过长/.test(message) ? 400 : 502;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

