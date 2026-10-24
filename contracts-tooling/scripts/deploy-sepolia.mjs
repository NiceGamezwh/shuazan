/**
 * Proxy-aware Sepolia deploy for PlatformLedger (uses parent node_modules ethers).
 * Usage from repo root:
 *   node contracts-tooling/scripts/deploy-sepolia.mjs
 * Reads .env.local for LEDGER_* and XYSQ3_HTTPS_PROXY.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import solc from "solc";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");
const require = createRequire(path.join(root, "package.json"));

function loadEnvLocal() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!(k in process.env) || !process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

const {
  ContractFactory,
  FetchRequest,
  JsonRpcProvider,
  Wallet,
} = require("ethers");

function pickProxy() {
  return (
    process.env.LEDGER_HTTPS_PROXY ||
    process.env.XYSQ3_HTTPS_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    ""
  ).trim();
}

async function getProvider(rpcUrl, chainId, proxyUrl) {
  if (!proxyUrl) return new JsonRpcProvider(rpcUrl, chainId);
  let agent;
  if (/^socks5?h?:\/\//i.test(proxyUrl)) {
    const { SocksProxyAgent } = require("socks-proxy-agent");
    agent = new SocksProxyAgent(proxyUrl);
  } else {
    const { HttpsProxyAgent } = require("https-proxy-agent");
    const normalized = /^(https?):\/\//i.test(proxyUrl) ? proxyUrl : `http://${proxyUrl}`;
    agent = new HttpsProxyAgent(normalized);
  }
  const req = new FetchRequest(rpcUrl);
  req.getUrlFunc = FetchRequest.createGetUrlFunc({ agent });
  return new JsonRpcProvider(req, chainId);
}

function compile() {
  const sourcePath = path.join(root, "contracts", "PlatformLedger.sol");
  const source = fs.readFileSync(sourcePath, "utf8");
  const input = {
    language: "Solidity",
    sources: { "PlatformLedger.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } },
    },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  if (out.errors?.some((e) => e.severity === "error")) {
    console.error(out.errors);
    throw new Error("compile failed");
  }
  const art = out.contracts["PlatformLedger.sol"].PlatformLedger;
  return { abi: art.abi, bytecode: art.evm.bytecode.object };
}

async function main() {
  const rpcUrl = process.env.LEDGER_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
  const chainId = Number(process.env.LEDGER_CHAIN_ID || "11155111");
  const pk = process.env.LEDGER_OPERATOR_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!pk) throw new Error("缺少 LEDGER_OPERATOR_PRIVATE_KEY");

  const operator = process.env.OPERATOR || "0xefce7092589ca8bcb2bdf412fd2bd2d0af30c764";
  const withdrawer = process.env.WITHDRAWER || "0xfed39b4d8b1c65fd3a7fdb43ca1cef87b5b20d83";
  const usdt = process.env.USDT || process.env.LEDGER_USDT_ADDRESS || "0x10279e6333f9d0EE103F4715b8aaEA75BE61464C";
  const usdtDecimals = Number(process.env.USDT_DECIMALS || "6");
  const proxyUrl = pickProxy();

  console.log("Compiling…");
  const { abi, bytecode } = compile();
  console.log("Bytecode length:", bytecode.length);

  console.log("Connecting RPC", rpcUrl, "proxy=", proxyUrl || "(none)");
  const provider = await getProvider(rpcUrl, chainId, proxyUrl);
  const wallet = new Wallet(pk, provider);
  console.log("Deployer:", wallet.address);
  const bal = await provider.getBalance(wallet.address);
  console.log("Balance wei:", bal.toString());

  const factory = new ContractFactory(abi, bytecode, wallet);
  console.log("Deploying PlatformLedger…");
  const contract = await factory.deploy(operator, withdrawer, usdt, usdtDecimals);
  console.log("Tx:", contract.deploymentTransaction()?.hash);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log("Deployed:", address);

  const out = {
    network: "sepolia",
    chainId,
    address,
    operator,
    withdrawer,
    usdt,
    usdtDecimals,
    deployer: wallet.address,
    txHash: contract.deploymentTransaction()?.hash || null,
    deployedAt: new Date().toISOString(),
  };
  const outPath = path.join(__dirname, "last-deploy.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("Wrote", outPath);

  // Patch .env.local LEDGER_CONTRACT_ADDRESS + NEXT_PUBLIC_* for browser deposit
  const envPath = path.join(root, ".env.local");
  if (fs.existsSync(envPath)) {
    let env = fs.readFileSync(envPath, "utf8");
    const upsert = (key, val) => {
      const re = new RegExp(`^${key}=.*$`, "m");
      if (re.test(env)) env = env.replace(re, `${key}=${val}`);
      else env += `\n${key}=${val}\n`;
    };
    upsert("LEDGER_CONTRACT_ADDRESS", address);
    upsert("NEXT_PUBLIC_LEDGER_CONTRACT_ADDRESS", address);
    upsert("NEXT_PUBLIC_LEDGER_USDT_ADDRESS", usdt);
    fs.writeFileSync(envPath, env);
    console.log("Updated .env.local LEDGER_CONTRACT_ADDRESS + NEXT_PUBLIC_*");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
