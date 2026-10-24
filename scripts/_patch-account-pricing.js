const fs = require("fs");
const p = "app/account/page.tsx";
let s = fs.readFileSync(p, "utf8");

if (!s.includes("recharge-pricing")) {
  s = s.replace(
    'DEFAULT_RATE_SCALED,\n} from "@/lib/ledger-browser";',
    'DEFAULT_RATE_SCALED,\n} from "@/lib/ledger-browser";\nimport {\n  alipayPayFen,\n  fenToYuanStr,\n  tryParseYuanToFen,\n  walletPayFen,\n} from "@/lib/recharge-pricing";',
  );
}

if (!s.includes("alipayCreditFen")) {
  s = s.replace(
    "  const walletQuote = useMemo(\n    () => estimateUsdtFromYuan(walletYuanInput, rateScaled),\n    [walletYuanInput, rateScaled],\n  );",
    "  const alipayCreditFen = tryParseYuanToFen(alipayYuanInput);\n  const alipayPayableFen = alipayCreditFen > 0 ? alipayPayFen(alipayCreditFen) : 0;\n\n  const walletCreditFen = tryParseYuanToFen(walletYuanInput);\n  const walletPayableFen = walletCreditFen > 0 ? walletPayFen(walletCreditFen) : 0;\n  const walletQuote = useMemo(\n    () =>\n      estimateUsdtFromYuan(\n        walletPayableFen > 0 ? fenToYuanStr(walletPayableFen) : \"\",\n        rateScaled,\n      ),\n    [walletPayableFen, rateScaled],\n  );",
  );
}

const oldWalletStart = "    const q = estimateUsdtFromYuan(walletYuanInput.trim(), rateScaled);";
if (s.includes(oldWalletStart) && !s.includes("wallet-complete")) {
  const start = s.indexOf(oldWalletStart);
  const endMarker = "      setDepositBusy(false);\n    }\n  };\n\n  const runAlipayCreate";
  const end = s.indexOf(endMarker, start);
  if (start < 0 || end < 0) {
    console.log("wallet block bounds fail", start, end);
  } else {
    const neu = `    const creditFen = tryParseYuanToFen(walletYuanInput.trim());
    if (creditFen <= 0) {
      setDepositMessage("请输入大于 0 的人民币金额（最多两位小数）");
      return;
    }
    const payFen = walletPayFen(creditFen);
    const q = estimateUsdtFromYuan(fenToYuanStr(payFen), rateScaled);
    if (q.usdtRaw <= BigInt(0)) {
      setDepositMessage("请输入大于 0 的人民币金额（最多两位小数）");
      return;
    }
    setDepositBusy(true);
    try {
      const result = await approveAndDepositToAccount({
        usdtHuman: q.usdtHuman,
        usernameHash: auth.usernameHash,
        ledgerAddress,
        usdtAddress,
        onStatus: setDepositMessage,
      });
      setDepositMessage("支付已确认，正在补齐到账金额…");
      const completeRes = await fetch("/api/ledger/wallet-complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: \`Bearer \${auth.token}\`,
        },
        body: JSON.stringify({ creditFen, depositTxHash: result.txHash }),
      });
      const completeData = await completeRes.json();
      if (!completeRes.ok || !completeData?.ok) {
        setDepositMessage(
          \`已支付 \${q.usdtHuman} USDC，但到账补齐失败：\${String(completeData?.error || "请稍后刷新或联系客服")}\`,
        );
      } else {
        setDepositMessage(
          \`充值成功！支付约 \${q.usdtHuman} USDC（钱包 9 折），到账 ¥\${fenToYuanStr(creditFen)}\`,
        );
      }
      if (auth.token) await refreshMe(auth.token);
    } catch (e) {
      setDepositMessage(e instanceof Error ? e.message : "充值失败");
    } finally {
      setDepositBusy(false);
    }
  };

  const runAlipayCreate`;
    s = s.slice(0, start) + neu + s.slice(end + endMarker.length - "  const runAlipayCreate".length);
    console.log("wallet block replaced");
  }
} else {
  console.log("wallet skip", { hasOld: s.includes(oldWalletStart), hasComplete: s.includes("wallet-complete") });
}

s = s.replace(
  "setDepositMessage(`支付宝到账成功：¥${data.amountYuan}。余额已更新。`);",
  "setDepositMessage(`支付宝到账成功：¥${data.creditYuan || data.amountYuan}。余额已更新。`);",
);

const introOld = `两种充值均输入<strong className="text-[#f5f5f0]">人民币（元）</strong>：支付宝（支付FM）或
          链上钱包（Sepolia USDC，汇率 1 USDC ≈{" "}
          <b className="text-[#ffd600]">{rateHuman}</b> 元）。`;
const introNew = `两种充值均输入<strong className="text-[#f5f5f0]">到账金额（人民币元）</strong>：支付宝含 3%
          手续费；钱包充值享 9 折支付（Sepolia USDC）。无最低额度，用多少充多少。`;
if (s.includes(introOld)) {
  s = s.replace(introOld, introNew);
  console.log("intro ok");
} else {
  console.log("intro miss");
}

// alipay box - simpler replacements
s = s.replace(
  '到账金额{" "}\n                      <b className="text-[#ffd600]">¥{alipayYuanInput || "—"}</b>\n                      <span className="text-[#888]">（1:1 人民币分入账）</span>',
  '到账{" "}\n                      <b className="text-[#ffd600]">¥{alipayCreditFen > 0 ? fenToYuanStr(alipayCreditFen) : "—"}</b>\n                    </div>\n                    <div className="mt-1">\n                      应付{" "}\n                      <b className="text-[#ffd600]">¥{alipayPayableFen > 0 ? fenToYuanStr(alipayPayableFen) : "—"}</b>\n                      <span className="text-[#888]">（含 3% 手续费）</span>',
);

// wallet preview block by markers
const wPreviewStart = s.indexOf("充值 <b className=\"text-[#ffd600]\">¥{walletYuanInput");
if (wPreviewStart > 0) {
  const boxStart = s.lastIndexOf('<div className="mb-5 border border-[#3a3210]', wPreviewStart);
  const boxEnd = s.indexOf("Approve + 充值到账号", wPreviewStart);
  // find closing of preview div before button - look for flow line
  const flowIdx = s.indexOf("流程：授权 USDC", wPreviewStart);
  if (boxStart > 0 && flowIdx > 0) {
    const endDiv = s.indexOf("</div>", flowIdx);
    const replacement = `                  <div className="mb-5 border border-[#3a3210] bg-[#171500] p-4 font-ibm-mono text-xs leading-6 text-[#c7c2a0]">
                    <div>
                      到账{" "}
                      <b className="text-[#ffd600]">
                        ¥{walletCreditFen > 0 ? fenToYuanStr(walletCreditFen) : "—"}
                      </b>
                    </div>
                    <div className="mt-1">
                      钱包支付约{" "}
                      <b className="text-[#ffd600]">{walletQuote.usdtHuman}</b> USDC
                      <span className="text-[#888]">（相对到账金额 9 折）</span>
                    </div>
                    <div className="mt-1 text-[#666]">
                      流程：授权 USDC → 确认支付 → 到账按填写金额入账
                    </div>
                  </div>`;
    s = s.slice(0, boxStart) + replacement + s.slice(endDiv + 6);
    console.log("wallet preview ok");
  } else console.log("wallet preview bounds", boxStart, flowIdx);
} else console.log("wallet preview miss");

s = s.replace(
  "<li>两种充值均输入人民币元，无最低额度（大于 0 即可）。支付宝走支付FM 回调入账；链上钱包按汇率换成 USDC 后 Approve + deposit。</li>",
  "<li>填写到账金额（元），无最低额度（大于 0 即可）。支付宝应付 = 到账 × 1.03；钱包支付约按到账 9 折换算 USDC。</li>",
);
s = s.replace(
  "<li>链上：应付 USDC = ceil(人民币分 × 10^decimals / rateScaled)，合约再 floor 回分，到账约等于目标（允许 1 分内误差）。</li>",
  "<li>钱包充值：先按实付 USDC 入账，再由系统补齐至填写的到账金额。</li>",
);

if (s.includes("const rateHuman") && (s.match(/rateHuman/g) || []).length === 1) {
  s = s.replace(/^\s*const rateHuman = \(rateScaled \/ 100\)\.toFixed\(2\);\r?\n/m, "");
  console.log("removed rateHuman");
}

fs.writeFileSync(p, s);
console.log("summary", {
  import: s.includes("recharge-pricing"),
  alipay: s.includes("alipayPayableFen"),
  walletComplete: s.includes("wallet-complete"),
  rateLine: s.includes("汇率：1 USDC"),
  rateHuman: (s.match(/rateHuman/g) || []).length,
  feeTip: s.includes("含 3% 手续费"),
});
