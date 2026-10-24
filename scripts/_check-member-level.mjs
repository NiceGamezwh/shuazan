import { ethers } from "ethers";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
const get = (k) => {
  const m = env.match(new RegExp("^" + k + "=(.*)$", "m"));
  return m ? m[1].trim().replace(/^"|"$/g, "") : "";
};
const rpc = get("SEPOLIA_RPC_URL") || get("NEXT_PUBLIC_SEPOLIA_RPC_URL") || get("LEDGER_RPC_URL");
const addr = get("LEDGER_CONTRACT_ADDRESS") || get("NEXT_PUBLIC_LEDGER_CONTRACT_ADDRESS");
const username = "17263900020";
const userId = ethers.id(username);
console.log({ addr, userId, rpc: rpc ? rpc.slice(0, 40) + "..." : "" });
const abi = [
  "function membershipLevel(bytes32) view returns (uint8)",
  "function balanceOf(bytes32) view returns (uint256)",
];
const provider = new ethers.JsonRpcProvider(rpc);
const c = new ethers.Contract(addr, abi, provider);
const level = Number(await c.membershipLevel(userId));
const bal = (await c.balanceOf(userId)).toString();
console.log({ level, balanceFen: bal, expectedBps: [10000,9000,8000,6000,5000][level] });
