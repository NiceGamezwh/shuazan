const fs = require("fs");
const path = require("path");
const skip = new Set(["node_modules", ".next", "contracts-tooling", "scripts", "data"]);
function walk(d, acc=[]) {
  for (const e of fs.readdirSync(d,{withFileTypes:true})) {
    if (skip.has(e.name)) continue;
    const p = path.join(d,e.name);
    if (e.isDirectory()) walk(p,acc);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) acc.push(p);
  }
  return acc;
}
const keys = ["useState(\"10\")", "useState('10')", 'YuanInput', "yuanInput", "minOrder", "最低", "min=", ">= 10", "> 10", "至少", "10 元", "10元", 'placeholder="例如'];
for (const f of walk(".")) {
  const lines = fs.readFileSync(f,"utf8").split(/\n/);
  lines.forEach((l,i) => {
    if (/walletYuan|alipayYuan|default.*10|\"10\"|'10'|最低充值|minAmount|MIN_/.test(l) || /placeholder=.*10|例如 10/.test(l)) {
      console.log(f+":"+(i+1)+":"+l.trim().slice(0,140));
    }
  });
}
