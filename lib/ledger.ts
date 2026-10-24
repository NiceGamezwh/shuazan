import {
  Contract,
  FetchRequest,
  JsonRpcProvider,
  Wallet,
  id,
  isHexString,
  solidityPackedKeccak256,
  ZeroHash,
} from "ethers";
import {
  applyDiscountFen,
  discountBpsForLevel,
  getTier,
  upgradePriceFen,
  type MembershipLevel,
} from "@/lib/membership";

/** Minimal ABI for PlatformLedger (views + operator write paths + auth). */
export const PLATFORM_LEDGER_ABI = [
  "function operator() view returns (address)",
  "function withdrawer() view returns (address)",
  "function usdt() view returns (address)",
  "function usdtDecimals() view returns (uint8)",
  "function rateScaled() view returns (uint256)",
  "function paused() view returns (bool)",
  "function balanceOf(bytes32 userId) view returns (uint256)",
  "function walletBalanceOf(address wallet) view returns (uint256)",
  "function usedOrderIds(bytes32 orderId) view returns (bool)",
  "function passwordOf(bytes32 usernameHash) view returns (bytes32)",
  "function isRegistered(bytes32 usernameHash) view returns (bool)",
  "function hashUsername(string username) pure returns (bytes32)",
  "function hashPassword(string username, string password) pure returns (bytes32)",
  "function registerUser(bytes32 usernameHash, bytes32 passwordHash)",
  "function register(string username, string password)",
  "function verifyLogin(string username, string password) view returns (bool)",
  "function verifyLoginHash(bytes32 usernameHash, bytes32 passwordHash) view returns (bool)",
  "function getBalance(bytes32 usernameHash) view returns (uint256)",
  "function balanceOfUsername(string username) view returns (uint256)",
  "function depositByAdmin(bytes32 userId, uint256 amountFen, bytes32 orderId)",
  "function consume(bytes32 userId, uint256 amountFen, bytes32 orderId)",
  "function quoteUsdtToFen(uint256 usdtAmount) view returns (uint256)",
  "function depositUSDT(uint256 usdtAmount)",
  "function depositUSDTToAccount(bytes32 userId, uint256 usdtAmount)",
  "event Consumed(bytes32 indexed userId, uint256 amountFen, bytes32 indexed orderId, address indexed caller)",
  "event Deposited(bytes32 indexed userId, uint256 amountFen, bytes32 indexed orderId, address indexed caller)",
  "event UsdtDepositedToAccount(bytes32 indexed userId, address indexed payer, uint256 usdtAmount, uint256 rmbFen, uint256 rateScaledUsed)",
  "event Registered(bytes32 indexed usernameHash, address indexed caller)",
  "function membershipLevel(bytes32 userId) view returns (uint8)",
  "function membershipPriceFen(uint8 level) pure returns (uint256)",
  "function membershipDiscountBps(uint8 level) pure returns (uint256)",
  "function getMembership(bytes32 userId) view returns (uint8 level, uint256 discountBps)",
  "function getPriceAfterDiscount(bytes32 userId, uint256 priceFen) view returns (uint256)",
  "function getMembershipUpgradePrice(bytes32 userId, uint8 newLevel) view returns (uint256)",
  "function purchaseMembership(bytes32 userId, uint8 level, bytes32 orderId)",
  "function setMembership(bytes32 userId, uint8 level)",
  "event MembershipPurchased(bytes32 indexed userId, uint8 level, uint256 priceFen, bytes32 indexed orderId, address indexed caller)",
  "event MembershipSet(bytes32 indexed userId, uint8 level, address indexed caller)",
] as const;

export type LedgerConfig = {
  chainId: number;
  rpcUrl: string;
  contractAddress: string;
  operatorPrivateKey: string;
  usdtAddress: string;
  proxyUrl: string;
};

function pickProxyUrl(): string {
  return (
    process.env.LEDGER_HTTPS_PROXY?.trim() ||
    process.env.XYSQ3_HTTPS_PROXY?.trim() ||
    process.env.HTTPS_PROXY?.trim() ||
    process.env.HTTP_PROXY?.trim() ||
    process.env.XYSQ3_SOCKS_PROXY?.trim() ||
    process.env.ALL_PROXY?.trim() ||
    process.env.SOCKS_PROXY?.trim() ||
    process.env.SOCKS5_PROXY?.trim() ||
    ""
  );
}

export function getLedgerConfig(): LedgerConfig {
  const chainId = Number(process.env.LEDGER_CHAIN_ID || "11155111");
  const rpcUrl =
    process.env.LEDGER_RPC_URL?.trim() ||
    "https://ethereum-sepolia-rpc.publicnode.com";
  const contractAddress = process.env.LEDGER_CONTRACT_ADDRESS?.trim() || "";
  const operatorPrivateKey = process.env.LEDGER_OPERATOR_PRIVATE_KEY?.trim() || "";
  const usdtAddress = process.env.LEDGER_USDT_ADDRESS?.trim() || "";
  return {
    chainId: Number.isFinite(chainId) ? chainId : 11155111,
    rpcUrl,
    contractAddress,
    operatorPrivateKey,
    usdtAddress,
    proxyUrl: pickProxyUrl(),
  };
}

function isSocksProxy(proxyUrl: string): boolean {
  return /^socks5?h?:\/\//i.test(proxyUrl.trim());
}

function normalizeProxyUrl(proxyUrl: string): string {
  const raw = proxyUrl.trim();
  if (!raw) return raw;
  if (/^(https?|socks5?h?):\/\//i.test(raw)) return raw;
  return `http://${raw}`;
}

type ProxyDispatcher = { proxyUrl: string; agent: unknown };
let cachedDispatcher: ProxyDispatcher | null = null;

async function getProxyAgent(proxyUrl: string) {
  const normalized = normalizeProxyUrl(proxyUrl);
  if (cachedDispatcher && cachedDispatcher.proxyUrl === normalized) {
    return cachedDispatcher.agent;
  }
  let agent;
  if (isSocksProxy(normalized)) {
    const { SocksProxyAgent } = await import("socks-proxy-agent");
    agent = new SocksProxyAgent(normalized);
  } else {
    const { HttpsProxyAgent } = await import("https-proxy-agent");
    agent = new HttpsProxyAgent(normalized);
  }
  cachedDispatcher = { proxyUrl: normalized, agent };
  return agent;
}

/**
 * Build a JsonRpcProvider. If LEDGER/XYSQ3 proxy is set, route RPC through it
 * (useful when public Sepolia RPC is blocked without Clash).
 */
export async function getLedgerProvider(): Promise<JsonRpcProvider> {
  const { rpcUrl, chainId, proxyUrl } = getLedgerConfig();
  if (!proxyUrl) {
    return new JsonRpcProvider(rpcUrl, chainId);
  }
  const agent = await getProxyAgent(proxyUrl);
  const req = new FetchRequest(rpcUrl);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req.getUrlFunc = FetchRequest.createGetUrlFunc({ agent: agent as any });
  return new JsonRpcProvider(req, chainId);
}

export async function getOperatorWallet(): Promise<Wallet> {
  const { operatorPrivateKey } = getLedgerConfig();
  if (!operatorPrivateKey) {
    throw new Error("缺少 LEDGER_OPERATOR_PRIVATE_KEY");
  }
  const provider = await getLedgerProvider();
  return new Wallet(operatorPrivateKey, provider);
}

export async function getLedgerContract(withSigner = false): Promise<Contract> {
  const { contractAddress } = getLedgerConfig();
  if (!contractAddress) {
    throw new Error("缺少 LEDGER_CONTRACT_ADDRESS");
  }
  if (withSigner) {
    const wallet = await getOperatorWallet();
    return new Contract(contractAddress, PLATFORM_LEDGER_ABI, wallet);
  }
  const provider = await getLedgerProvider();
  return new Contract(contractAddress, PLATFORM_LEDGER_ABI, provider);
}

/**
 * Matches Solidity: keccak256(bytes(username)) / ethers.id(username)
 */
export function hashUsername(username: string): string {
  const raw = String(username ?? "").trim();
  if (!raw) throw new Error("username 不能为空");
  return id(raw);
}

/**
 * Matches Solidity:
 *   keccak256(abi.encodePacked(username, bytes1(0), password))
 * Never store or log plaintext passwords.
 */
export function hashPassword(username: string, password: string): string {
  const u = String(username ?? "").trim();
  const p = String(password ?? "");
  if (!u) throw new Error("username 不能为空");
  if (!p) throw new Error("password 不能为空");
  // string + bytes1(0x00) + string  — solidityPacked packs UTF-8 bytes of strings
  return solidityPackedKeccak256(["string", "bytes1", "string"], [u, "0x00", p]);
}

/** bytes32 hex (0x + 64), or keccak256(utf8) of username / order string. */
export function toBytes32Id(input: string): string {
  const raw = String(input ?? "").trim();
  if (!raw) throw new Error("userId/orderId 不能为空");
  if (isHexString(raw, 32)) return raw.toLowerCase();
  // ethers.id === keccak256(toUtf8Bytes(str)) — matches Solidity keccak256(bytes(username))
  return id(raw);
}

export function resolveUserId(body: {
  userId?: string;
  username?: string;
}): string {
  if (body.userId != null && String(body.userId).trim()) {
    return toBytes32Id(String(body.userId));
  }
  if (body.username != null && String(body.username).trim()) {
    return hashUsername(String(body.username));
  }
  throw new Error("请提供 userId 或 username");
}

export function parseAmountFen(value: unknown): bigint {
  if (typeof value === "bigint") {
    if (value <= BigInt(0)) throw new Error("amountFen 必须为正整数");
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
      throw new Error("amountFen 必须为正整数");
    }
    return BigInt(value);
  }
  const s = String(value ?? "").trim();
  if (!/^\d+$/.test(s) || s === "0") {
    throw new Error("amountFen 必须为正整数");
  }
  return BigInt(s);
}

export function parseOrderId(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("orderId 不能为空");
  return toBytes32Id(raw);
}

export function describeLedgerError(error: unknown): string {
  if (!(error instanceof Error)) return "操作失败，请稍后重试";
  const anyErr = error as Error & {
    shortMessage?: string;
    reason?: string;
    code?: string;
    info?: { error?: { message?: string } };
    cause?: unknown;
    data?: string;
  };
  const parts = [
    anyErr.shortMessage,
    anyErr.reason,
    anyErr.message,
    anyErr.info?.error?.message,
  ].filter(Boolean) as string[];
  const cause = anyErr.cause;
  if (cause instanceof Error && cause.message) parts.push(cause.message);
  const text = [...new Set(parts)].join(" | ");
  if (/InsufficientBalance|insufficient/i.test(text)) {
    return "余额不足";
  }
  if (/AlreadyRegistered/i.test(text)) {
    return "用户名已注册";
  }
  if (/NotRegistered/i.test(text)) {
    return "用户未注册";
  }
  if (/OrderAlreadyUsed/i.test(text)) {
    return "订单号已使用，请重试";
  }
  if (/MembershipAlreadyAtOrAbove|MembershipDowngrade/i.test(text)) {
    return "会员只能升级不能降级";
  }
  if (/InvalidMembershipLevel/i.test(text)) {
    return "无效的会员档位";
  }
  const { proxyUrl } = getLedgerConfig();
  if (
    !proxyUrl &&
    /fetch failed|ECONNREFUSED|ENOTFOUND|Connect|certificate|TLS|timeout|ETIMEDOUT/i.test(
      text,
    )
  ) {
    return "网络异常，请稍后重试";
  }
  return "操作失败，请稍后重试";
}

export { ZeroHash };

/** Read-only sanity check against deployed contract. */
export async function verifyLedgerOnChain(): Promise<{
  ok: boolean;
  operator: string;
  withdrawer: string;
  usdt: string;
  usdtDecimals: number;
  rateScaled: string;
  paused: boolean;
  expectedOperator: string;
  expectedUsdt: string;
  operatorMatches: boolean;
  usdtMatches: boolean;
  derivedOperatorAddress: string;
  hasAuth: boolean;
}> {
  const cfg = getLedgerConfig();
  const wallet = cfg.operatorPrivateKey
    ? new Wallet(cfg.operatorPrivateKey)
    : null;
  const derivedOperatorAddress = wallet?.address?.toLowerCase() ?? "";
  const contract = await getLedgerContract(false);
  const [operator, withdrawer, usdt, usdtDecimals, rateScaled, paused] =
    await Promise.all([
      contract.operator() as Promise<string>,
      contract.withdrawer() as Promise<string>,
      contract.usdt() as Promise<string>,
      contract.usdtDecimals() as Promise<number>,
      contract.rateScaled() as Promise<bigint>,
      contract.paused() as Promise<boolean>,
    ]);
  let hasAuth = false;
  try {
    await contract.isRegistered(ZeroHash);
    hasAuth = true;
  } catch {
    hasAuth = false;
  }
  const expectedOperator = (
    derivedOperatorAddress || "0xefce7092589ca8bcb2bdf412fd2bd2d0af30c764"
  ).toLowerCase();
  const expectedUsdt = (
    cfg.usdtAddress || "0x10279e6333f9d0EE103F4715b8aaEA75BE61464C"
  ).toLowerCase();
  const operatorMatches = operator.toLowerCase() === expectedOperator;
  const usdtMatches = usdt.toLowerCase() === expectedUsdt;
  return {
    ok: operatorMatches && usdtMatches && hasAuth,
    operator,
    withdrawer,
    usdt,
    usdtDecimals: Number(usdtDecimals),
    rateScaled: rateScaled.toString(),
    paused,
    expectedOperator,
    expectedUsdt,
    operatorMatches,
    usdtMatches,
    derivedOperatorAddress,
    hasAuth,
  };
}


/** Known PlatformLedger deploy tx on Sepolia (for fromBlock fallback). */
const LEDGER_DEPLOY_TX =
  process.env.LEDGER_DEPLOY_TX?.trim() ||
  "0x6500d15549b2bf70515ea0b8ccacb836457668a47ef878d5f4383a0fe72d0778";

const LOG_CHUNK_SIZE = 8_000;
const DEFAULT_LOOKBACK_BLOCKS = 150_000;
const DEFAULT_MAX_EVENTS = 50;

export type LedgerEventKind =
  | "Consumed"
  | "Deposited"
  | "UsdtDepositedToAccount";

export type LedgerOrderEvent = {
  type: LedgerEventKind;
  label: string;
  txHash: string;
  blockNumber: number;
  amountFen: string;
  amountRmb: string;
  orderId: string | null;
  orderIdShort: string | null;
  usdtAmount: string | null;
  timestamp: number | null;
};

function fenToRmbString(fen: bigint): string {
  const neg = fen < BigInt(0);
  const abs = neg ? -fen : fen;
  const whole = abs / BigInt(100);
  const frac = (abs % BigInt(100)).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${whole.toString()}.${frac}`;
}

function shortBytes32(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const h = String(hex);
  if (h.length < 18) return h;
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}

async function resolveLedgerFromBlock(
  provider: JsonRpcProvider,
  latest: number,
): Promise<{ fromBlock: number; source: string }> {
  const env = process.env.LEDGER_FROM_BLOCK?.trim();
  if (env && /^\d+$/.test(env)) {
    return { fromBlock: Number(env), source: "env:LEDGER_FROM_BLOCK" };
  }
  try {
    const receipt = await provider.getTransactionReceipt(LEDGER_DEPLOY_TX);
    if (receipt?.blockNumber != null) {
      return {
        fromBlock: Number(receipt.blockNumber),
        source: "deployTx",
      };
    }
  } catch {
    /* ignore */
  }
  const fromBlock = Math.max(0, latest - DEFAULT_LOOKBACK_BLOCKS);
  return { fromBlock, source: `lookback:${DEFAULT_LOOKBACK_BLOCKS}` };
}

async function queryFilterChunked(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contract: Contract,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter: any,
  fromBlock: number,
  toBlock: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const out: unknown[] = [];
  let start = fromBlock;
  while (start <= toBlock) {
    const end = Math.min(start + LOG_CHUNK_SIZE - 1, toBlock);
    try {
      const chunk = await contract.queryFilter(filter, start, end);
      out.push(...chunk);
    } catch (err) {
      // Some RPCs reject large ranges — retry with half chunk once.
      if (end > start) {
        const mid = Math.floor((start + end) / 2);
        const a = await contract.queryFilter(filter, start, mid);
        const b = await contract.queryFilter(filter, mid + 1, end);
        out.push(...a, ...b);
      } else {
        throw err;
      }
    }
    start = end + 1;
  }
  return out;
}

/**
 * Query Consumed / Deposited / UsdtDepositedToAccount for a usernameHash.
 * Caps at `limit` newest events. Does not throw on empty results.
 */
export async function queryUserLedgerEvents(options: {
  usernameHash: string;
  limit?: number;
  kinds?: LedgerEventKind[];
}): Promise<{
  events: LedgerOrderEvent[];
  fromBlock: number;
  toBlock: number;
  fromBlockSource: string;
  usernameHash: string;
}> {
  const limit = Math.min(
    Math.max(1, options.limit ?? DEFAULT_MAX_EVENTS),
    100,
  );
  const kinds = new Set<LedgerEventKind>(
    options.kinds ?? ["Consumed", "Deposited", "UsdtDepositedToAccount"],
  );
  const userId = toBytes32Id(options.usernameHash);
  const provider = await getLedgerProvider();
  const contract = await getLedgerContract(false);
  const latest = await provider.getBlockNumber();
  const { fromBlock, source } = await resolveLedgerFromBlock(provider, latest);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: Array<{ kind: LedgerEventKind; log: any }> = [];

  if (kinds.has("Consumed")) {
    const filter = contract.filters.Consumed(userId);
    const logs = await queryFilterChunked(contract, filter, fromBlock, latest);
    for (const log of logs) raw.push({ kind: "Consumed", log });
  }
  if (kinds.has("Deposited")) {
    const filter = contract.filters.Deposited(userId);
    const logs = await queryFilterChunked(contract, filter, fromBlock, latest);
    for (const log of logs) raw.push({ kind: "Deposited", log });
  }
  if (kinds.has("UsdtDepositedToAccount")) {
    const filter = contract.filters.UsdtDepositedToAccount(userId);
    const logs = await queryFilterChunked(contract, filter, fromBlock, latest);
    for (const log of logs) raw.push({ kind: "UsdtDepositedToAccount", log });
  }

  raw.sort((a, b) => {
    const bn =
      Number(b.log.blockNumber ?? 0) - Number(a.log.blockNumber ?? 0);
    if (bn !== 0) return bn;
    return Number(b.log.index ?? 0) - Number(a.log.index ?? 0);
  });

  const sliced = raw.slice(0, limit);

  const blockNums = [
    ...new Set(
      sliced
        .map((r) => Number(r.log.blockNumber))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  ];
  const tsMap = new Map<number, number>();
  await Promise.all(
    blockNums.map(async (bn) => {
      try {
        const block = await provider.getBlock(bn);
        if (block?.timestamp != null) {
          tsMap.set(bn, Number(block.timestamp));
        }
      } catch {
        /* skip timestamp */
      }
    }),
  );

  const labelOf = (k: LedgerEventKind): string => {
    if (k === "Consumed") return "消费/下单";
    if (k === "Deposited") return "充值(管理员)";
    return "USDC充值";
  };

  const events: LedgerOrderEvent[] = sliced.map(({ kind, log }) => {
    const args = log.args ?? {};
    let amountFen = BigInt(0);
    let orderId: string | null = null;
    let usdtAmount: string | null = null;
    if (kind === "Consumed" || kind === "Deposited") {
      amountFen = BigInt(args.amountFen ?? args[1] ?? 0);
      const oid = args.orderId ?? args[2];
      orderId = oid != null ? String(oid) : null;
    } else {
      amountFen = BigInt(args.rmbFen ?? args[3] ?? 0);
      usdtAmount = String(args.usdtAmount ?? args[2] ?? "");
    }
    const txHash = String(log.transactionHash ?? "");
    const blockNumber = Number(log.blockNumber ?? 0);
    return {
      type: kind,
      label: labelOf(kind),
      txHash,
      blockNumber,
      amountFen: amountFen.toString(),
      amountRmb: fenToRmbString(amountFen),
      orderId,
      orderIdShort: shortBytes32(orderId),
      usdtAmount,
      timestamp: tsMap.get(blockNumber) ?? null,
    };
  });

  return {
    events,
    fromBlock,
    toBlock: latest,
    fromBlockSource: source,
    usernameHash: userId,
  };
}

/** Read on-chain membership for a usernameHash. */
export async function getMembershipOnChain(userId: string): Promise<{
  level: MembershipLevel;
  discountBps: number;
  name: string;
  discountLabel: string;
}> {
  const contract = await getLedgerContract(false);
  const result = await contract.getMembership(userId);
  const level = Number(result.level ?? result[0] ?? 0) as MembershipLevel;
  const discountBps = Number(result.discountBps ?? result[1] ?? discountBpsForLevel(level));
  const tier = getTier(level);
  return {
    level,
    discountBps: Number.isFinite(discountBps) ? discountBps : tier.discountBps,
    name: tier.name,
    discountLabel: tier.discountLabel,
  };
}

export async function getPriceAfterDiscountOnChain(
  userId: string,
  priceFen: bigint,
): Promise<bigint> {
  const contract = await getLedgerContract(false);
  try {
    return (await contract.getPriceAfterDiscount(userId, priceFen)) as bigint;
  } catch {
    const mem = await getMembershipOnChain(userId);
    return applyDiscountFen(priceFen, mem.discountBps);
  }
}

export { applyDiscountFen, getTier, discountBpsForLevel, upgradePriceFen };
