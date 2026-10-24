import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const require = createRequire(path.join(root, "package.json"));

const envPath = path.join(root, ".env.local");
const env = fs.readFileSync(envPath, "utf8");
for (const line of env.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim();
  if (!process.env[k]) process.env[k] = v;
}

const txHash = "0x6500d15549b2bf70515ea0b8ccacb836457668a47ef878d5f4383a0fe72d0778";
let envOut = fs.readFileSync(envPath, "utf8");
const upsert = (key, val) => {
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(envOut)) envOut = envOut.replace(re, `${key}=${val}`);
  else envOut += `\n${key}=${val}\n`;
};
upsert("LEDGER_DEPLOY_TX", txHash);
fs.writeFileSync(envPath, envOut);

// patch ledger.ts default deploy tx
const ledgerPath = path.join(root, "lib/ledger.ts");
let ledger = fs.readFileSync(ledgerPath, "utf8");
ledger = ledger.replace(/"0xbae934aaec971f809f8d707411792f6f75fffed4d0c3777b972ac5ea6cef08f0"/, `"${txHash}"`);
ledger = ledger.replace(/"0x2b74b821afcb41140d8a7c79113ea057e1cedcd0e42255011e38c7c58208188e"/, `"${txHash}"`);
fs.writeFileSync(ledgerPath, ledger);

const {
  Contract,
  FetchRequest,
  JsonRpcProvider,
  Wallet,
  id,
  solidityPackedKeccak256,
} = require("ethers");
const { HttpsProxyAgent } = await import("https-proxy-agent");

const rpc = process.env.LEDGER_RPC_URL;
const addr = process.env.LEDGER_CONTRACT_ADDRESS;
const pk = process.env.LEDGER_OPERATOR_PRIVATE_KEY;
const proxy = (process.env.LEDGER_HTTPS_PROXY || process.env.XYSQ3_HTTPS_PROXY || "").trim();

let provider;
if (proxy) {
  const agent = new HttpsProxyAgent(/^https?:/i.test(proxy) ? proxy : "http://" + proxy);
  const req = new FetchRequest(rpc);
  req.getUrlFunc = FetchRequest.createGetUrlFunc({ agent });
  provider = new JsonRpcProvider(req, 11155111);
} else {
  provider = new JsonRpcProvider(rpc, 11155111);
}
const wallet = new Wallet(pk, provider);
const abi = [
  "function registerUser(bytes32,bytes32)",
  "function isRegistered(bytes32) view returns (bool)",
  "function depositByAdmin(bytes32,uint256,bytes32)",
  "function balanceOf(bytes32) view returns (uint256)",
  "function purchaseMembership(bytes32,uint8,bytes32)",
  "function getMembership(bytes32) view returns (uint8,uint256)",
  "function getMembershipUpgradePrice(bytes32,uint8) view returns (uint256)",
  "function getPriceAfterDiscount(bytes32,uint256) view returns (uint256)",
];
const c = new Contract(addr, abi, wallet);

const username = "upg_smoke_" + Date.now().toString(36);
const password = "TestPass123!";
const userId = id(username);
const passwordHash = solidityPackedKeccak256(["string", "bytes1", "string"], [username, "0x00", password]);

console.log("addr", addr);
console.log("username", username);

const reg = await c.registerUser(userId, passwordHash);
await reg.wait();
console.log("registered");

// deposit 50 RMB = 5000 fen
const dep = await c.depositByAdmin(userId, 5000n, id("dep:" + username + ":" + Date.now()));
await dep.wait();
console.log("bal after dep", (await c.balanceOf(userId)).toString());

console.log("upgrade to basic quote", (await c.getMembershipUpgradePrice(userId, 1)).toString());
const buy1 = await c.purchaseMembership(userId, 1, id("mem1:" + username));
await buy1.wait();
let bal = await c.balanceOf(userId);
console.log("after basic: level", Number((await c.getMembership(userId))[0]), "bal", bal.toString(), "expect 4010");

console.log("upgrade to gold quote", (await c.getMembershipUpgradePrice(userId, 2)).toString(), "expect 3000");
const buy2 = await c.purchaseMembership(userId, 2, id("mem2:" + username));
await buy2.wait();
bal = await c.balanceOf(userId);
const mem = await c.getMembership(userId);
console.log("after gold: level", Number(mem[0]), "bps", Number(mem[1]), "bal", bal.toString(), "expect 1010");
console.log("10000 fen after disc", (await c.getPriceAfterDiscount(userId, 10000n)).toString(), "expect 8000");
