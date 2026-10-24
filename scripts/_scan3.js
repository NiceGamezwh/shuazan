const fs = require("fs");
const files = [
  "app/api/auth/register/route.ts",
  "app/api/auth/me/route.ts",
  "app/api/ledger/membership/route.ts",
  "app/account/page.tsx",
  "components/DouyinZone.tsx",
];
const re = /链上|合约|Sepolia|上链|账本|Etherscan|keccak|已写入|gas\b|txHash|交易哈希/;
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  fs.readFileSync(f, "utf8").split(/\n/).forEach((l, i) => {
    if (re.test(l) && (/["'`]/.test(l) || /[\u4e00-\u9fff]/.test(l))) {
      console.log(f + ":" + (i + 1) + ":" + l.trim().slice(0, 150));
    }
  });
}
console.log("--- membership msgs ---");
const a = fs.readFileSync("app/account/page.tsx", "utf8");
a.split(/\n/).forEach((l, i) => {
  if (/setDepositMessage|setMembershipMessage|开通成功|充值成功/.test(l)) {
    console.log((i + 1) + ":" + l.trim().slice(0, 160));
  }
});
