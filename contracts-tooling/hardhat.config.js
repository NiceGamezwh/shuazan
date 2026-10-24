const path = require("path");
require("@nomicfoundation/hardhat-toolbox");

// Optional: load parent .env.local for deploy convenience
try {
  require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });
} catch (_) {
  /* dotenv optional */
}

const repoRoot = path.join(__dirname, "..");

function pickAccounts() {
  const key =
    process.env.PRIVATE_KEY ||
    process.env.LEDGER_OPERATOR_PRIVATE_KEY ||
    "";
  return key ? [key] : [];
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  paths: {
    root: repoRoot,
    sources: path.join(repoRoot, "contracts"),
    artifacts: path.join(__dirname, "artifacts"),
    cache: path.join(__dirname, "cache"),
    tests: path.join(__dirname, "test"),
  },
  networks: {
    hardhat: {},
    sepolia: {
      url:
        process.env.LEDGER_RPC_URL ||
        process.env.SEPOLIA_RPC ||
        "https://ethereum-sepolia-rpc.publicnode.com",
      chainId: 11155111,
      accounts: pickAccounts(),
    },
    bsc: {
      url: process.env.BSC_RPC || "https://bsc-dataseed.binance.org",
      chainId: 56,
      accounts: pickAccounts(),
    },
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC || "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      accounts: pickAccounts(),
    },
  },
};
