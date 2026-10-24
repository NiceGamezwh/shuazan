import { NextRequest, NextResponse } from "next/server";
import {
  describeLedgerError,
  getLedgerConfig,
  getLedgerContract,
  parseAmountFen,
  parseOrderId,
  resolveUserId,
} from "@/lib/ledger";

export const runtime = "nodejs";

type ConsumeBody = {
  userId?: string;
  username?: string;
  amountFen?: number | string;
  orderId?: string;
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

  let body: ConsumeBody;
  try {
    body = (await request.json()) as ConsumeBody;
  } catch {
    return NextResponse.json({ ok: false, error: "请求体必须是 JSON" }, { status: 400 });
  }

  try {
    const userId = resolveUserId(body);
    const amountFen = parseAmountFen(body.amountFen);
    const orderId = parseOrderId(body.orderId);

    const contract = await getLedgerContract(true);
    const tx = await contract.consume(userId, amountFen, orderId);
    const receipt = await tx.wait();

    return NextResponse.json({
      ok: true,
      userId,
      amountFen: amountFen.toString(),
      orderId,
      txHash: receipt?.hash ?? tx.hash,
      blockNumber: receipt?.blockNumber ?? null,
    });
  } catch (error) {
    const message = describeLedgerError(error);
    const status = /请提供|不能为空|必须为/.test(message) ? 400 : 502;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
