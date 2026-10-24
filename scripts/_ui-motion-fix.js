const fs = require("fs");

// Fix balance flash ref update
{
  const p = "components/DouyinZone.tsx";
  let s = fs.readFileSync(p, "utf8");
  s = s.replace(
    `  useEffect(() => {
    if (balanceFen == null) return;
    if (prevBalanceFen.current != null && prevBalanceFen.current !== balanceFen) {
      setBalanceFlash(true);
      const t = window.setTimeout(() => setBalanceFlash(false), 450);
      return () => window.clearTimeout(t);
    }
    prevBalanceFen.current = balanceFen;
  }, [balanceFen]);`,
    `  useEffect(() => {
    if (balanceFen == null) return;
    if (prevBalanceFen.current != null && prevBalanceFen.current !== balanceFen) {
      setBalanceFlash(true);
      const t = window.setTimeout(() => setBalanceFlash(false), 450);
      prevBalanceFen.current = balanceFen;
      return () => window.clearTimeout(t);
    }
    prevBalanceFen.current = balanceFen;
  }, [balanceFen]);`
  );
  // sanity: balance JSX
  if (!s.includes('className={balanceFlash ? "nb-balance-flash font-bold"')) {
    console.log("WARN balance flash JSX missing");
  }
  fs.writeFileSync(p, s);
  console.log("balance flash fixed");
}

// Account page light motion
{
  const p = "app/account/page.tsx";
  let s = fs.readFileSync(p, "utf8");

  // deposit tabs
  s = s.replace(
    /className={`flex flex-1 items-center justify-center gap-2 px-3 py-2\.5 font-ibm-mono text-\[11px\] transition \$\{[\s\S]*?depositTab === "alipay"[\s\S]*?`}/,
    `className={\`nb-tab-btn flex flex-1 items-center justify-center gap-2 px-3 py-2.5 font-ibm-mono text-xs font-semibold \${
                    depositTab === "alipay"
                      ? "bg-[#ffd600] font-bold text-[#0a0a0a]"
                      : "border border-[#444] text-[#ccc] hover:border-[#ffd600] hover:text-[#f5f5f0]"
                  }\`}`
  );
  s = s.replace(
    /className={`flex flex-1 items-center justify-center gap-2 px-3 py-2\.5 font-ibm-mono text-\[11px\] transition \$\{[\s\S]*?depositTab === "wallet"[\s\S]*?`}/,
    `className={\`nb-tab-btn flex flex-1 items-center justify-center gap-2 px-3 py-2.5 font-ibm-mono text-xs font-semibold \${
                    depositTab === "wallet"
                      ? "bg-[#ffd600] font-bold text-[#0a0a0a]"
                      : "border border-[#444] text-[#ccc] hover:border-[#ffd600] hover:text-[#f5f5f0]"
                  }\`}`
  );

  // balance + recharge cards outer borders
  s = s.replace(
    '<div className="border border-[#292929] bg-[#101010] p-6">\n              <div className="mb-4 flex items-center justify-between">\n                <div className="font-ibm-mono text-[10px] tracking-[2px] text-[#666]">\n                  ACCOUNT BALANCE',
    '<div className="nb-account-card border border-[#292929] bg-[#101010] p-6">\n              <div className="mb-4 flex items-center justify-between">\n                <div className="font-ibm-mono text-[10px] tracking-[2px] text-[#666]">\n                  ACCOUNT BALANCE'
  );
  s = s.replace(
    '<div className="border border-[#292929] bg-[#101010] p-6">\n              <div className="mb-4 font-ibm-mono text-[10px] tracking-[2px] text-[#666]">\n                RECHARGE / 人民币充值',
    '<div className="nb-account-card border border-[#292929] bg-[#101010] p-6">\n              <div className="mb-4 font-ibm-mono text-[10px] tracking-[2px] text-[#666]">\n                RECHARGE / 人民币充值'
  );

  // membership cards
  s = s.replace(
    `className={\`border p-5 \${
                      isCurrent
                        ? "border-[#ffd600] bg-[#171500]"
                        : "border-[#292929] bg-[#0a0a0a]"
                    }\`}`,
    `className={\`nb-account-card border p-5 \${
                      isCurrent
                        ? "border-[#ffd600] bg-[#171500]"
                        : "border-[#292929] bg-[#0a0a0a]"
                    }\`}`
  );

  // membership CTA
  s = s.replace(
    `className={\`w-full px-4 py-2.5 text-xs font-bold transition \${
                        !canBuy
                          ? "cursor-not-allowed bg-[#292929] text-[#777]"
                          : membershipBusy
                            ? "cursor-not-allowed bg-[#9a8f3a] text-[#0a0a0a]"
                            : "bg-[#ffd600] text-[#0a0a0a] hover:bg-[#fff06a]"
                      }\`}`,
    `className={\`nb-cta w-full px-4 py-2.5 text-xs font-bold \${
                        !canBuy
                          ? "cursor-not-allowed bg-[#292929] text-[#777]"
                          : membershipBusy
                            ? "cursor-not-allowed bg-[#9a8f3a] text-[#0a0a0a]"
                            : "bg-[#ffd600] text-[#0a0a0a]"
                      }\`}`
  );

  // order tabs
  s = s.replace(
    `className={\`px-4 py-2 font-ibm-mono text-[11px] transition \${
                    ordersTab === tab.id
                      ? "bg-[#ffd600] font-bold text-[#0a0a0a]"
                      : "border border-[#333] text-[#aaa] hover:border-[#ffd600] hover:text-[#ffd600]"
                  }\`}`,
    `className={\`nb-tab-btn px-4 py-2.5 font-ibm-mono text-xs font-semibold \${
                    ordersTab === tab.id
                      ? "bg-[#ffd600] font-bold text-[#0a0a0a]"
                      : "border border-[#444] text-[#ccc] hover:border-[#ffd600] hover:text-[#ffd600]"
                  }\`}`
  );

  // primary deposit buttons - add nb-cta where hover:bg yellow
  s = s.replaceAll(
    "bg-[#ffd600] hover:bg-[#fff06a]",
    "nb-cta bg-[#ffd600]"
  );
  s = s.replaceAll(
    "hover:bg-[#fff06a]",
    ""
  );

  fs.writeFileSync(p, s);
  console.log(
    "account",
    "nb-account-card", s.split("nb-account-card").length - 1,
    "nb-tab-btn", s.split("nb-tab-btn").length - 1,
    "nb-cta", s.split("nb-cta").length - 1
  );
}
