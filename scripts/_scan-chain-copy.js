const fs = require("fs");
const path = require("path");
const skip = new Set(["node_modules", ".next", "contracts-tooling", "cache", "artifacts", "out", "scripts", "contracts", "data"]);
function walk(d, acc = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) acc.push(p);
  }
  return acc;
}
const keywords = [
  "链上", "合约", "Sepolia", "sepolia", "Etherscan", "etherscan", "区块链", "上链",
  "交易哈希", "on-chain", "onchain", "On-chain", "usernameHash", "keccak",
  "MetaMask", "gas", "Remix", "txHash", "TX:", "浏览器查看", "区块浏览器",
  "账本", "operator", "写入链", "链上余额", "永久会员（链上",
];
const root = process.cwd();
for (const f of walk(root)) {
  const rel = path.relative(root, f);
  if (/[\\/]lib[\\/](ledger|auth|xysq3)/.test(rel)) continue;
  const lines = fs.readFileSync(f, "utf8").split(/\n/);
  lines.forEach((l, i) => {
    const t = l.trim();
    if (!t || t.startsWith("import ") || t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
    // skip code-only identifiers unless in string
    const hasStr = /["'`]/.test(l) || /[\u4e00-\u9fff]/.test(l);
    if (!hasStr) return;
    for (const k of keywords) {
      if (l.includes(k)) {
        console.log(rel + ":" + (i + 1) + ":" + t.slice(0, 180));
        break;
      }
    }
  });
}
