const fs = require("fs");

{
  const p = "app/account/page.tsx";
  let s = fs.readFileSync(p, "utf8");
  s = s.replace('const [walletYuanInput, setWalletYuanInput] = useState("10");',
                'const [walletYuanInput, setWalletYuanInput] = useState("");');
  s = s.replace('const [alipayYuanInput, setAlipayYuanInput] = useState("10");',
                'const [alipayYuanInput, setAlipayYuanInput] = useState("");');
  s = s.replace('placeholder="例如 10 或 50.00"', 'placeholder="任意金额，大于 0"');
  s = s.replace('placeholder="例如 10 或 66.00"', 'placeholder="任意金额，大于 0"');

  if (!s.includes("无最低充值限制")) {
    s = s.replace(
      `<div className="mb-4 font-ibm-mono text-[10px] tracking-[2px] text-[#666]">
                RECHARGE / 人民币充值
              </div>

              <div className="mb-5 flex gap-2">`,
      `<div className="mb-4 font-ibm-mono text-[10px] tracking-[2px] text-[#666]">
                RECHARGE / 人民币充值
              </div>
              <div className="mb-4 border border-[#3a3210] bg-[#171500] px-3 py-2.5 font-ibm-mono text-[11px] leading-5 text-[#ffd600]">
                <b>无最低充值限制</b>：建议用多少充多少，金额大于 0 即可（最多两位小数）。
              </div>

              <div className="mb-5 flex gap-2">`
    );
  }

  s = s.replace(
    `<div className="mt-2 font-ibm-mono text-[10px] text-[#555]">
                余额单位：分（1 元 = 100 分）
              </div>`,
    `<div className="mt-2 font-ibm-mono text-[10px] leading-5 text-[#777]">
                余额单位：分（1 元 = 100 分）。充值无最低额度，用多少充多少（大于 0 即可）。
              </div>`
  );

  s = s.replace(
    "<li>两种充值均输入人民币元。支付宝走支付FM 回调入账；链上钱包按汇率换成 USDC 后 Approve + deposit。</li>",
    "<li>两种充值均输入人民币元，无最低额度（大于 0 即可）。支付宝走支付FM 回调入账；链上钱包按汇率换成 USDC 后 Approve + deposit。</li>"
  );

  fs.writeFileSync(p, s);
  console.log("account", {
    walletEmpty: s.includes('setWalletYuanInput] = useState("")'),
    alipayEmpty: s.includes('setAlipayYuanInput] = useState("")'),
    tip: s.includes("无最低充值限制"),
    ph: (s.match(/任意金额，大于 0/g) || []).length,
  });
}

{
  const p = "components/DouyinZone.tsx";
  let s = fs.readFileSync(p, "utf8");
  const old = `请先前往{' '}
                <a href="/account" className="underline text-[#ffd600] hover:text-[#fff06a]">个人中心充值</a>
                {' '}后再支付。`;
  const neu = `请先前往{' '}
                <a href="/account" className="underline text-[#ffd600] hover:text-[#fff06a]">个人中心充值</a>
                {' '}（无最低额度，用多少充多少）后再支付。`;
  if (s.includes(old)) {
    s = s.replace(old, neu);
    console.log("douyin ok");
  } else if (s.includes("用多少充多少")) {
    console.log("douyin already");
  } else {
    console.log("douyin miss");
  }
  fs.writeFileSync(p, s);
}
