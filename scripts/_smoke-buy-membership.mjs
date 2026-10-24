import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { createHmac } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const require = createRequire(path.join(root, "package.json"));

const env = fs.readFileSync(path.join(root, ".env.local"), "utf8");
for (const line of env.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim();
  if (!process.env[k]) process.env[k] = v;
}

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
  "function getPriceAfterDiscount(bytes32,uint256) view returns (uint256)",
];
const c = new Contract(addr, abi, wallet);

const username = "member_smoke_" + Date.now().toString(36);
const password = "TestPass123!";
const userId = id(username);
const passwordHash = solidityPackedKeccak256(["string", "bytes1", "string"], [username, "0x00", password]);

console.log("username", username);
console.log("userId", userId);

if (!(await c.isRegistered(userId))) {
  const tx = await c.registerUser(userId, passwordHash);
  console.log("register tx", tx.hash);
  await tx.wait();
}

// deposit 50 RMB = 5000 fen for buying basic (990)
const depOrder = id("dep:" + username + ":" + Date.now());
const depTx = await c.depositByAdmin(userId, 5000n, depOrder);
console.log("deposit tx", depTx.hash);
await depTx.wait();
console.log("balance", (await c.balanceOf(userId)).toString());

const buyOrder = id("mem:" + username + ":1:" + Date.now());
const buyTx = await c.purchaseMembership(userId, 1, buyOrder);
console.log("buy basic tx", buyTx.hash);
await buyTx.wait();

const mem = await c.getMembership(userId);
console.log("membership", Number(mem[0]), Number(mem[1]));
console.log("10000 fen after discount", (await c.getPriceAfterDiscount(userId, 10000n)).toString());
console.log("balance after", (await c.balanceOf(userId)).toString());

// try downgrade purchase should fail
try {
  const bad = await c.purchaseMembership.staticCall(userId, 1, id("bad:" + Date.now()));
  console.log("unexpected success", bad);
} catch (e) {
  console.log("upgrade-only ok:", (e.shortMessage || e.message || "").slice(0, 120));
}
