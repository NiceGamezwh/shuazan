import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

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

const { Contract, FetchRequest, JsonRpcProvider } = require("ethers");
const { HttpsProxyAgent } = await import("https-proxy-agent");

const rpc = process.env.LEDGER_RPC_URL;
const addr = process.env.LEDGER_CONTRACT_ADDRESS;
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
const abi = [
  "function getMembership(bytes32) view returns (uint8,uint256)",
  "function membershipPriceFen(uint8) pure returns (uint256)",
  "function getPriceAfterDiscount(bytes32,uint256) view returns (uint256)",
  "function operator() view returns (address)",
  "function membershipDiscountBps(uint8) pure returns (uint256)",
];
const c = new Contract(addr, abi, provider);
console.log("addr", addr);
console.log("operator", await c.operator());
for (const lv of [1, 2, 3, 4]) {
  console.log(
    "level",
    lv,
    "price",
    (await c.membershipPriceFen(lv)).toString(),
    "bps",
    (await c.membershipDiscountBps(lv)).toString(),
  );
}
const z = "0x" + "00".repeat(32);
const m = await c.getMembership(z);
console.log("mem0", Number(m[0]), Number(m[1]));
console.log("priceAfterDisc 3000", (await c.getPriceAfterDiscount(z, 3000n)).toString());
