const fs=require("fs");
const files=["app/account/page.tsx","lib/ledger-browser.ts","lib/zfm.ts","lib/ledger.ts"];
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const lines=fs.readFileSync(f,"utf8").split(/\n/);
  lines.forEach((l,i)=>{
    if (/estimateUsdt|rateScaled|depositUSDT|approveAndDeposit|rmbFen|amountYuan|createOrder|手续|rateHuman|DEFAULT_RATE|depositByAdmin|targetFen|usdtHuman/.test(l))
      console.log(f+":"+(i+1)+":"+l.trim().slice(0,140));
  });
}
console.log("--- zfm create ---");
const z=fs.readdirSync("app/api/pay/zfm",{withFileTypes:true}).map(e=>e.name);
console.log(z);
