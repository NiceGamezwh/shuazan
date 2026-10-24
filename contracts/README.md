# PlatformLedger 合约说明

主文件：`contracts/PlatformLedger.sol`

中心化人民币账本（金额单位：**分**，1 RMB = 100 fen）+ **用户名/密码哈希注册登录**。

## 密码哈希（不明文）

- `usernameHash = keccak256(bytes(username))`
- `passwordHash = keccak256(abi.encodePacked(username, bytes1(0), password))`
- 存储：`passwordOf[usernameHash] = passwordHash`，`isRegistered[usernameHash]=true`
- 登录校验：`verifyLogin(username, password)` view

后端等价（ethers v6）：

```js
import { id, solidityPackedKeccak256 } from "ethers";
const usernameHash = id(username); // keccak256(utf8)
const passwordHash = solidityPackedKeccak256(
  ["string", "bytes1", "string"],
  [username, "0x00", password],
);
```

## 角色

| 角色 | 默认地址（部署时可改） | 权限 |
|------|------------------------|------|
| **operator** | `0xefce7092589ca8bcb2bdf412fd2bd2d0af30c764` | `registerUser` / `depositByAdmin` / `consume` / `setRate` / pause / transferOperator |
| **withdrawer** | `0xfed39b4d8b1c65fd3a7fdb43ca1cef87b5b20d83` | 仅 `withdrawToken` / `withdrawUSDT` / transferWithdrawer |

另有 public `register(username, password)`（调用者付 gas）；中心化前端无钱包时用后端 `registerUser`（operator 代发）。

## Sepolia 部署

合约不可升级，改 ABI 后需**重新部署**，并更新 `.env.local` 的 `LEDGER_CONTRACT_ADDRESS`。

### 自动部署（推荐）

在项目根目录（需已配置 `.env.local` 的 operator 私钥与代理）：

```bash
npm i -D solc@0.8.20
node contracts-tooling/scripts/deploy-sepolia.mjs
```

或 Hardhat：

```bash
cd contracts-tooling
npx hardhat compile
npx hardhat run scripts/deploy.js --network sepolia
```

### Remix 手动部署参数

1. 打开 Remix，粘贴 `PlatformLedger.sol`，编译 0.8.20
2. Environment: Injected Provider（Sepolia）或 Remix VM 仅作测试
3. Constructor：
   - `_operator`: `0xefce7092589ca8bcb2bdf412fd2bd2d0af30c764`
   - `_withdrawer`: `0xfed39b4d8b1c65fd3a7fdb43ca1cef87b5b20d83`
   - `_usdt`: `0x10279e6333f9d0EE103F4715b8aaEA75BE61464C`（项目 Sepolia USDT）
   - `_usdtDecimals`: `6`
4. 部署后把地址发回，写入 `LEDGER_CONTRACT_ADDRESS`

## 前端商品价

展示价与扣款 = 上游 `GoodsPrice × 3`（人民币），扣款转分：`Math.round(displayTotal * 100)`。

## USDC 充值到账号

- depositUSDT(amount)：记入 `walletBalanceOf[msg.sender]`（钱包余额，与账号分离）
- **depositUSDTToAccount(userId, amount)**：`transferFrom` 调用者 USDC，按 `rateScaled` 换算人民币分，记入已注册 `balanceOf[userId]`（下单可用）
- 默认汇率 `rateScaled = 660` → 1 USDC = 6.60 元
- 个人页：`/account`（MetaMask Sepolia → Approve → Deposit）
- 浏览器需配置 `NEXT_PUBLIC_LEDGER_CONTRACT_ADDRESS` / `NEXT_PUBLIC_LEDGER_USDT_ADDRESS`


## 部署历史（Sepolia）

| 时间 (UTC) | 地址 | 说明 |
|------------|------|------|
| 2026-10-23 16:10 | `0x8c6E1508D9e53121B9EC663a48d3e97eabd7C92d` | 旧合约（已弃用） |
| 2026-10-23 16:34 | `0xe299aF8c008A3Ef68d59aC1Da16feda8834188Fa` | **当前** .env.local 指向 |

合约不可升级。换合约后，旧合约上的注册用户/余额不会自动迁移，需**重新注册**（余额需另行处理）。

