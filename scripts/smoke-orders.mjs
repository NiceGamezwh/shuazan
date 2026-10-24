import { readFileSync } from 'fs';
import { Contract, FetchRequest, JsonRpcProvider, id } from 'ethers';

function loadEnv() {
  const raw = readFileSync('.env.local','utf8');
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    out[line.slice(0,i).trim()] = line.slice(i+1).trim();
  }
  return out;
}

const env = loadEnv();
const rpc = env.LEDGER_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const address = env.LEDGER_CONTRACT_ADDRESS;
const chainId = Number(env.LEDGER_CHAIN_ID || 11155111);
const proxyUrl = env.LEDGER_HTTPS_PROXY || env.XYSQ3_HTTPS_PROXY || env.HTTPS_PROXY || '';
const deployTx = '0x2b74b821afcb41140d8a7c79113ea057e1cedcd0e42255011e38c7c58208188e';

const abi = [
  'event Consumed(bytes32 indexed userId, uint256 amountFen, bytes32 indexed orderId, address indexed caller)',
  'event Deposited(bytes32 indexed userId, uint256 amountFen, bytes32 indexed orderId, address indexed caller)',
  'event UsdtDepositedToAccount(bytes32 indexed userId, address indexed payer, uint256 usdtAmount, uint256 rmbFen, uint256 rateScaledUsed)',
];

async function provider() {
  if (!proxyUrl) return new JsonRpcProvider(rpc, chainId);
  const { HttpsProxyAgent } = await import('https-proxy-agent');
  const agent = new HttpsProxyAgent(proxyUrl.startsWith('http') ? proxyUrl : 'http://'+proxyUrl);
  const req = new FetchRequest(rpc);
  req.getUrlFunc = FetchRequest.createGetUrlFunc({ agent });
  return new JsonRpcProvider(req, chainId);
}

const p = await provider();
const latest = await p.getBlockNumber();
let fromBlock = Math.max(0, latest - 150000);
try {
  const receipt = await p.getTransactionReceipt(deployTx);
  if (receipt?.blockNumber) fromBlock = Number(receipt.blockNumber);
} catch {}
console.log(JSON.stringify({ latest, fromBlock, address }, null, 2));

const c = new Contract(address, abi, p);
// Unfiltered Consumed sample (may be empty)
const consumed = await c.queryFilter(c.filters.Consumed(), fromBlock, latest);
const deposited = await c.queryFilter(c.filters.Deposited(), fromBlock, latest);
const usdtAcc = await c.queryFilter(c.filters.UsdtDepositedToAccount(), fromBlock, latest);
console.log(JSON.stringify({
  consumedCount: consumed.length,
  depositedCount: deposited.length,
  usdtToAccountCount: usdtAcc.length,
  sampleConsumed: consumed.slice(-3).map(l => ({
    userId: String(l.args?.userId ?? ''),
    amountFen: String(l.args?.amountFen ?? ''),
    orderId: String(l.args?.orderId ?? '').slice(0,18)+'…',
    tx: l.transactionHash,
    block: Number(l.blockNumber),
  })),
  emptyOk: true,
}, null, 2));

// Dummy user should return empty, not throw
const dummy = id('__smoke_nonexistent_user__');
const empty = await c.queryFilter(c.filters.Consumed(dummy), fromBlock, latest);
console.log(JSON.stringify({ dummyUserConsumed: empty.length }, null, 2));
