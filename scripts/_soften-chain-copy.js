const fs = require("fs");
const path = require("path");

function patch(file, pairs) {
  const p = path.join("C:/Users/atao/Desktop/zwhnb/modern-design-tool-template", file);
  let s = fs.readFileSync(p, "utf8");
  let n = 0;
  for (const [a, b] of pairs) {
    if (!s.includes(a)) {
      console.log("MISS " + file + " :: " + JSON.stringify(a).slice(0, 80));
      continue;
    }
    const c = s.split(a).length - 1;
    s = s.split(a).join(b);
    n += c;
  }
  fs.writeFileSync(p, s);
  console.log("OK " + file + " (" + n + " replacements)");
}

// --- DouyinZone ---
patch("components/DouyinZone.tsx", [
  ['setAuthMessage(mode === "login" ? "登录中…" : "注册上链中（需等待交易确认）…");',
   'setAuthMessage(mode === "login" ? "登录中…" : "注册中，请稍候…");'],
  ['setAuthMessage(\n        mode === "register"\n          ? `注册成功，tx: ${String(data.txHash || "").slice(0, 12)}…`\n          : "登录成功",\n      );',
   'setAuthMessage(mode === "register" ? "注册成功" : "登录成功");'],
  ['setSubmitMessage("下单成功（已链上扣款）");',
   'setSubmitMessage("下单成功，余额已扣款");'],
  ['title="个人中心 / 链上充值"',
   'title="个人中心 / 充值"'],
  ['下单前请先登录或注册链上账号；支持 MetaMask 充值 USDC 到账号余额。',
   '下单前请先登录或注册账号；可在个人中心充值后下单。'],
  ['账号密码经 keccak256 哈希写入 Sepolia 合约；密码不明文上链。注册由平台 operator 代发交易。',
   '请使用用户名和密码登录或注册。密码仅用于登录校验，不会明文展示。'],
  ['>注册上链</button>',
   '>注册</button>'],
  ['余额充足，确认后将链上扣款并提交订单。',
   '余额充足，确认后将扣款并提交订单。'],
  ['ACCOUNT / ON-CHAIN',
   'ACCOUNT'],
]);

// --- account page ---
patch("app/account/page.tsx", [
  ['setOrdersError("请先登录后查看链上订单记录");',
   'setOrdersError("请先登录后查看订单记录");'],
  ['setOrdersError(String(data?.error || "加载链上记录失败"));',
   'setOrdersError(String(data?.error || "加载订单记录失败"));'],
  ['setAuthMessage(mode === "login" ? "登录中…" : "注册上链中（需等待交易确认）…");',
   'setAuthMessage(mode === "login" ? "登录中…" : "注册中，请稍候…");'],
  ['String(data?.error || "用户未注册。若你刚在旧合约注册过，请点「注册上链」重新注册。"),',
   'String(data?.error || "用户未注册，请先点击「注册」完成开户。"),'],
  ['setMembershipMessage("正在链上购买会员（扣余额）…");',
   'setMembershipMessage("正在开通会员（扣余额）…");'],
  ['充值将直接记入链上账号余额（balanceOf），下单优先扣此余额。',
   '充值成功后计入账户余额，下单时优先扣此余额。'],
  [`              <div className="mt-2 font-ibm-mono text-[10px] text-[#555]">
                {auth.balanceFen ?? "—"} 分 · usernameHash{" "}
                {auth.usernameHash ? \`\${auth.usernameHash.slice(0, 10)}…\` : "—"}
              </div>
              <div className="mt-6 border-t border-[#292929] pt-4 font-ibm-mono text-[10px] leading-5 text-[#666]">
                <div>
                  合约{" "}
                  <span className="text-[#aaa]">
                    {ledgerAddress ? \`\${ledgerAddress.slice(0, 10)}…\${ledgerAddress.slice(-6)}\` : "未配置"}
                  </span>
                </div>
                <div>
                  USDC{" "}
                  <span className="text-[#aaa]">
                    {usdtAddress.slice(0, 10)}…{usdtAddress.slice(-6)}
                  </span>
                </div>
              </div>`,
   `              <div className="mt-2 font-ibm-mono text-[10px] text-[#555]">
                余额单位：分（1 元 = 100 分）
              </div>`],
  ['MEMBERSHIP / ON-CHAIN',
   'MEMBERSHIP'],
  ['永久会员（链上档位）',
   '永久会员'],
  ['。开通会员享永久折扣：普通9折 / 黄金8折 / 钻石6折 / 至尊5折。升级只付差价；至尊交付为运营人工兑现，链上仅记档位。',
   '。开通会员享永久折扣：普通9折 / 黄金8折 / 钻石6折 / 至尊5折。升级只付差价；至尊权益由运营人工兑现。'],
  ['ON-CHAIN ORDERS / LEDGER',
   'ORDERS / HISTORY'],
  ['订单记录 / 链上流水',
   '订单记录'],
  ['暂无链上记录',
   '暂无订单记录'],
  ['下单扣款与充值成功后会出现在此列表。订单号为链上防重复单号。',
   '下单扣款与充值成功后会出现在此列表。'],
  ['title="链上防重复单号"',
   'title="订单号"'],
  ['? `订单号（链上防重复单号）：${ev.orderId}`\n                                : "链上防重复单号"',
   '? `订单号：${ev.orderId}`\n                                : "订单号"'],
  [`            {ordersMeta && (
              <div className="mt-4 font-ibm-mono text-[10px] leading-5 text-[#555]">
                扫描区块 {ordersMeta.fromBlock} → {ordersMeta.toBlock}
                {ordersMeta.fromBlockSource
                  ? \`（起点：\${ordersMeta.fromBlockSource}）\`
                  : ""}
                · 最多展示 50 条
              </div>
            )}`,
   `            {orders.length > 0 && (
              <div className="mt-4 font-ibm-mono text-[10px] leading-5 text-[#555]">
                最多展示最近 50 条
              </div>
            )}`],
  ['ACCOUNT / ON-CHAIN',
   'ACCOUNT'],
  ['注册上链',
   '注册'],
  // soften tip above wallet (intro still mentions 链上钱包 as recharge entry — keep)
  // bottom help: keep chain deposit how-to, soften event jargon
  ['下方「订单记录」读链上事件；支付宝入账对应 Deposited（管理员充值）。',
   '下方「订单记录」展示充值与消费流水；支付宝入账成功后也会出现在列表中。'],
  ['流程：Approve USDC → depositUSDTToAccount → 合约按汇率记人民币分',
   '流程：授权 USDC → 确认充值 → 按汇率记入账户余额（人民币分）'],
  ['汇率：1 USDC = {rateHuman} 元（rateScaled={rateScaled}）',
   '汇率：1 USDC = {rateHuman} 元'],
]);

// --- API user errors ---
patch("app/api/auth/login/route.ts", [
  ['? "用户未在当前合约注册。账本合约已更新，请重新注册后再登录."',
   '? "账号未注册或需重新注册，请先完成注册后再登录。"'],
]);

patch("app/api/ledger/orders/route.ts", [
  ['{ ok: false, error: "请先登录后再查看链上订单记录" },',
   '{ ok: false, error: "请先登录后再查看订单记录" },'],
]);

patch("app/api/order/route.ts", [
  ['{ ok: false, error: "账本未配置（LEDGER_CONTRACT_ADDRESS / LEDGER_OPERATOR_PRIVATE_KEY）" },',
   '{ ok: false, error: "支付服务暂未配置，请稍后重试或联系管理员" },'],
]);

patch("lib/ledger.ts", [
  ['if (!(error instanceof Error)) return "账本交互失败";',
   'if (!(error instanceof Error)) return "操作失败，请稍后重试";'],
  ['return "orderId 已使用";',
   'return "订单号已使用，请重试";'],
  ['return `${text}；若直连 Sepolia RPC 失败，可在 .env.local 设置 LEDGER_HTTPS_PROXY 或复用 XYSQ3_HTTPS_PROXY`;',
   'return "网络异常，请稍后重试";'],
  ['return text || "账本交互失败";',
   'return "操作失败，请稍后重试";'],
]);
