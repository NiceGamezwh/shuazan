/**
 * Browser-side ledger helpers (ethers + window.ethereum).
 * Contract/USDT addresses come from NEXT_PUBLIC_* (fallback to known Sepolia defaults).
 */
import { BrowserProvider, Contract, formatUnits, id, parseUnits } from "ethers";

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_CHAIN_HEX = "0xaa36a7";
export const DEFAULT_RATE_SCALED = 660; // 6.60 RMB / USDT
export const USDT_DECIMALS = 6;

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
] as const;

export const LEDGER_BROWSER_ABI = [
  "function rateScaled() view returns (uint256)",
  "function usdt() view returns (address)",
  "function usdtDecimals() view returns (uint8)",
  "function balanceOf(bytes32 userId) view returns (uint256)",
  "function walletBalanceOf(address wallet) view returns (uint256)",
  "function isRegistered(bytes32 usernameHash) view returns (bool)",
  "function quoteUsdtToFen(uint256 usdtAmount) view returns (uint256)",
  "function depositUSDT(uint256 usdtAmount)",
  "function depositUSDTToAccount(bytes32 userId, uint256 usdtAmount)",
  "function hashUsername(string username) pure returns (bytes32)",
  "function getMembership(bytes32 userId) view returns (uint8 level, uint256 discountBps)",
  "function getPriceAfterDiscount(bytes32 userId, uint256 priceFen) view returns (uint256)",
  "function membershipLevel(bytes32 userId) view returns (uint8)",
] as const;

export function getPublicLedgerAddress(): string {
  return (
    process.env.NEXT_PUBLIC_LEDGER_CONTRACT_ADDRESS?.trim() ||
    process.env.NEXT_PUBLIC_LEDGER_ADDRESS?.trim() ||
    ""
  );
}

export function getPublicUsdtAddress(): string {
  return (
    process.env.NEXT_PUBLIC_LEDGER_USDT_ADDRESS?.trim() ||
    "0x10279e6333f9d0EE103F4715b8aaEA75BE61464C"
  );
}

export function hashUsernameClient(username: string): string {
  return id(String(username ?? "").trim());
}

/** usdt human amount (e.g. "1.5") → fen estimate locally at rateScaled (default 660). */
export function estimateFenFromUsdt(
  usdtHuman: string,
  rateScaled: number = DEFAULT_RATE_SCALED,
  decimals: number = USDT_DECIMALS,
): bigint {
  const raw = String(usdtHuman ?? "").trim();
  if (!raw || !/^\d+(\.\d+)?$/.test(raw)) return BigInt(0);
  const amount = parseUnits(raw, decimals);
  const scale = BigInt(10) ** BigInt(decimals);
  return (amount * BigInt(rateScaled)) / scale;
}


/**
 * 人民币元 → 应付 USDC（最小单位 + 人类可读）。
 *
 * 合约入账：rmbFen = usdtAmount * rateScaled / 10^decimals（向下取整）
 * 反推应付：usdtRaw = ceil(targetFen * 10^decimals / rateScaled)（向上取整）
 * 这样到账 fen ≥ 目标分，通常相等或仅多 0～1 分量级对应的 USDC 尾差。
 *
 * 例：rateScaled=660，充值 ¥10 → targetFen=1000
 *   usdtRaw = ceil(1000 * 1e6 / 660) = 1515152
 *   expectedFen = 1515152 * 660 / 1e6 = 1000（刚好）
 */
export function estimateUsdtFromYuan(
  yuanHuman: string,
  rateScaled: number = DEFAULT_RATE_SCALED,
  decimals: number = USDT_DECIMALS,
): {
  targetFen: bigint;
  usdtRaw: bigint;
  usdtHuman: string;
  expectedFen: bigint;
} {
  const raw = String(yuanHuman ?? "").trim();
  const empty = {
    targetFen: BigInt(0),
    usdtRaw: BigInt(0),
    usdtHuman: "0",
    expectedFen: BigInt(0),
  };
  if (!raw || !/^\d+(\.\d{1,2})?$/.test(raw)) return empty;
  if (!Number.isFinite(rateScaled) || rateScaled <= 0) return empty;

  const [whole, frac = ""] = raw.split(".");
  const fenFrac = (frac + "00").slice(0, 2);
  const targetFen = BigInt(Number(whole) * 100 + Number(fenFrac));
  if (targetFen <= BigInt(0)) return empty;

  const scale = BigInt(10) ** BigInt(decimals);
  const rate = BigInt(Math.floor(rateScaled));
  // ceil(targetFen * scale / rate)
  const usdtRaw = (targetFen * scale + rate - BigInt(1)) / rate;
  const expectedFen = (usdtRaw * rate) / scale;
  const usdtHuman = formatUnits(usdtRaw, decimals);

  return { targetFen, usdtRaw, usdtHuman, expectedFen };
}

export function fenToYuan(fen: bigint | string | number): string {
  const n = typeof fen === "bigint" ? Number(fen) : Number(fen);
  if (!Number.isFinite(n)) return "0.00";
  return (n / 100).toFixed(2);
}

export type EthProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export function getEthereum(): EthProvider | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eth = (window as any).ethereum as EthProvider | undefined;
  return eth ?? null;
}

export async function connectSepoliaWallet(): Promise<{
  provider: BrowserProvider;
  address: string;
  chainId: number;
}> {
  const eth = getEthereum();
  if (!eth) throw new Error("未检测到 MetaMask / 钱包扩展，请先安装并解锁");

  await eth.request({ method: "eth_requestAccounts" });
  const provider = new BrowserProvider(eth);
  let network = await provider.getNetwork();
  let chainId = Number(network.chainId);

  if (chainId !== SEPOLIA_CHAIN_ID) {
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_HEX }],
      });
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 4902) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: SEPOLIA_CHAIN_HEX,
              chainName: "Sepolia",
              nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            },
          ],
        });
      } else {
        throw new Error("请切换到 Sepolia 测试网后再充值");
      }
    }
    network = await provider.getNetwork();
    chainId = Number(network.chainId);
    if (chainId !== SEPOLIA_CHAIN_ID) {
      throw new Error("钱包未切换到 Sepolia（chainId 11155111）");
    }
  }

  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  return { provider, address, chainId };
}

export async function approveAndDepositToAccount(opts: {
  usdtHuman: string;
  usernameHash: string;
  ledgerAddress?: string;
  usdtAddress?: string;
  onStatus?: (msg: string) => void;
}): Promise<{ txHash: string; rmbFen: string; usdtAmount: string }> {
  const ledgerAddress = (opts.ledgerAddress || getPublicLedgerAddress()).trim();
  const usdtAddress = (opts.usdtAddress || getPublicUsdtAddress()).trim();
  if (!ledgerAddress) throw new Error("缺少合约地址（NEXT_PUBLIC_LEDGER_CONTRACT_ADDRESS）");
  if (!opts.usernameHash) throw new Error("缺少 usernameHash");

  const { provider, address } = await connectSepoliaWallet();
  const signer = await provider.getSigner();
  const usdtAmount = parseUnits(String(opts.usdtHuman).trim(), USDT_DECIMALS);
  if (usdtAmount <= BigInt(0)) throw new Error("充值数量必须大于 0");

  const usdt = new Contract(usdtAddress, ERC20_ABI, signer);
  const ledger = new Contract(ledgerAddress, LEDGER_BROWSER_ABI, signer);

  opts.onStatus?.("检查 USDC 余额…");
  const bal: bigint = await usdt.balanceOf(address);
  if (bal < usdtAmount) {
    throw new Error(
      `钱包 USDC 不足：需要 ${formatUnits(usdtAmount, USDT_DECIMALS)}，当前 ${formatUnits(bal, USDT_DECIMALS)}`,
    );
  }

  opts.onStatus?.("检查授权额度…");
  const allowance: bigint = await usdt.allowance(address, ledgerAddress);
  if (allowance < usdtAmount) {
    opts.onStatus?.("请在钱包确认 Approve（授权 USDC）…");
    const approveTx = await usdt.approve(ledgerAddress, usdtAmount);
    await approveTx.wait();
  }

  opts.onStatus?.("请在钱包确认 Deposit（充值到账号）…");
  const tx = await ledger.depositUSDTToAccount(opts.usernameHash, usdtAmount);
  const receipt = await tx.wait();
  const rate: bigint = await ledger.rateScaled();
  const scale = BigInt(10) ** BigInt(USDT_DECIMALS);
  const rmbFen = (usdtAmount * rate) / scale;

  return {
    txHash: receipt?.hash ?? tx.hash,
    rmbFen: rmbFen.toString(),
    usdtAmount: usdtAmount.toString(),
  };
}

export { formatUnits, parseUnits };
