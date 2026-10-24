/**
 * Deploy PlatformLedger (with auth)
 *
 * Defaults for Sepolia (override with env):
 *   OPERATOR=0xefce7092589ca8bcb2bdf412fd2bd2d0af30c764
 *   WITHDRAWER=0xfed39b4d8b1c65fd3a7fdb43ca1cef87b5b20d83
 *   USDT=0x10279e6333f9d0EE103F4715b8aaEA75BE61464C  (Sepolia test USDT used by project)
 *   USDT_DECIMALS=6
 *
 * Run:
 *   cd contracts-tooling
 *   npx hardhat run scripts/deploy.js --network sepolia
 */
const hre = require("hardhat");
const path = require("path");
const fs = require("fs");

async function main() {
  const network = hre.network.name;
  const isSepolia = network === "sepolia" || Number(hre.network.config.chainId) === 11155111;

  const operator =
    process.env.OPERATOR || "0xefce7092589ca8bcb2bdf412fd2bd2d0af30c764";
  const withdrawer =
    process.env.WITHDRAWER || "0xfed39b4d8b1c65fd3a7fdb43ca1cef87b5b20d83";
  const usdt =
    process.env.USDT ||
    process.env.LEDGER_USDT_ADDRESS ||
    (isSepolia
      ? "0x10279e6333f9d0EE103F4715b8aaEA75BE61464C"
      : "0x55d398326f99059fF775485246999027B3197955");
  const usdtDecimals = Number(
    process.env.USDT_DECIMALS || (isSepolia ? "6" : "18"),
  );

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Network:", network, "chainId=", (await hre.ethers.provider.getNetwork()).chainId.toString());
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH");

  const Factory = await hre.ethers.getContractFactory("PlatformLedger");
  const ledger = await Factory.deploy(operator, withdrawer, usdt, usdtDecimals);
  await ledger.waitForDeployment();
  const address = await ledger.getAddress();

  console.log("PlatformLedger deployed to:", address);
  console.log("  operator:", operator);
  console.log("  withdrawer:", withdrawer);
  console.log("  usdt:", usdt);
  console.log("  usdtDecimals:", usdtDecimals);
  console.log("  rateScaled (default):", (await ledger.rateScaled()).toString());

  const out = {
    network,
    address,
    operator,
    withdrawer,
    usdt,
    usdtDecimals,
    deployedAt: new Date().toISOString(),
    txHash: ledger.deploymentTransaction()?.hash || null,
  };
  const outPath = path.join(__dirname, "last-deploy.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("Wrote", outPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
