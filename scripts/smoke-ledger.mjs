import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const { Contract, FetchRequest, JsonRpcProvider, Wallet, id, solidityPackedKeccak256 } = require("ethers");
const { HttpsProxyAgent } = require("https-proxy-agent");

function loadEnv() {
  for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const ABI = [
  "function hashUsername(string) pure returns (bytes32)",
  "function hashPassword(string,string) pure returns (bytes32)",
  "function isRegistered(bytes32) view returns (bool)",
  "function verifyLogin(string,string) view returns (bool)",
  "function registerUser(bytes32,bytes32)",
  "function depositByAdmin(bytes32,uint256,bytes32)",
  "function consume(bytes32,uint256,bytes32)",
  "function balanceOf(bytes32) view returns (uint256)",
  "function operator() view returns (address)",
];

const rpc = process.env.LEDGER_RPC_URL;
const proxy = process.env.XYSQ3_HTTPS_PROXY || process.env.LEDGER_HTTPS_PROXY || "";
const agent = new HttpsProxyAgent(proxy);
const req = new FetchRequest(rpc);
req.getUrlFunc = FetchRequest.createGetUrlFunc({ agent });
const provider = new JsonRpcProvider(req, 11155111);
const wallet = new Wallet(process.env.LEDGER_OPERATOR_PRIVATE_KEY, provider);
const c = new Contract(process.env.LEDGER_CONTRACT_ADDRESS, ABI, wallet);

const username = "testuser_" + Date.now().toString(36);
const password = "Passw0rd!";
const uhJs = id(username);
const phJs = solidityPackedKeccak256(["string", "bytes1", "string"], [username, "0x00", password]);
const uhSol = await c.hashUsername(username);
const phSol = await c.hashPassword(username, password);
console.log("contract", process.env.LEDGER_CONTRACT_ADDRESS);
console.log("operator", await c.operator());
console.log("usernameHash match", uhJs.toLowerCase() === uhSol.toLowerCase(), uhJs);
console.log("passwordHash match", phJs.toLowerCase() === phSol.toLowerCase(), phJs);

console.log("registering", username);
const tx1 = await c.registerUser(uhJs, phJs);
const r1 = await tx1.wait();
console.log("register tx", r1.hash);
console.log("isRegistered", await c.isRegistered(uhJs));
console.log("verifyLogin ok", await c.verifyLogin(username, password));
console.log("verifyLogin bad", await c.verifyLogin(username, "wrong"));

const orderId = id("deposit-test-" + Date.now());
const tx2 = await c.depositByAdmin(uhJs, 10000n, orderId);
const r2 = await tx2.wait();
console.log("deposit tx", r2.hash, "balanceFen", (await c.balanceOf(uhJs)).toString());

const consumeId = id("consume-test-" + Date.now());
const tx3 = await c.consume(uhJs, 300n, consumeId);
const r3 = await tx3.wait();
console.log("consume tx", r3.hash, "balanceFen", (await c.balanceOf(uhJs)).toString());
console.log("SMOKE_OK", username);
