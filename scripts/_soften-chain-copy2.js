const fs = require("fs");
const path = require("path");

// login route
{
  const p = "app/api/auth/login/route.ts";
  let s = fs.readFileSync(p, "utf8");
  s = s.replace(
    "用户未在当前合约注册。账本合约已更新，请重新注册后再登录。",
    "账号未注册或需重新注册，请先完成注册后再登录。",
  );
  s = s.replace("用户未注册，请先注册", "账号未注册，请先注册");
  fs.writeFileSync(p, s);
  console.log("login ok");
}

// scan all app/api for user-facing error strings with chain words
const skip = new Set(["node_modules", ".next"]);
function walk(d, acc = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
}
const keys = ["链上", "合约", "Sepolia", "账本", "上链", "Etherscan", "usernameHash", "keccak", "on-chain", "operator"];
for (const f of walk("app").concat(walk("components"))) {
  const lines = fs.readFileSync(f, "utf8").split(/\n/);
  lines.forEach((l, i) => {
    if (!/["'`]/.test(l) && !/[\u4e00-\u9fff]/.test(l)) return;
    if (l.trim().startsWith("//") || l.trim().startsWith("*") || l.trim().startsWith("import ")) return;
    for (const k of keys) {
      if (l.includes(k)) {
        console.log(f + ":" + (i + 1) + ":" + l.trim().slice(0, 160));
        break;
      }
    }
  });
}
