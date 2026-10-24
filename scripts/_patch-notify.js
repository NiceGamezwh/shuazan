const fs = require("fs");
const p = "app/api/pay/zfm/notify/route.ts";
let s = fs.readFileSync(p, "utf8");
const marker = "BigInt(order.amountFen)";
if (!s.includes(marker)) {
  console.log("marker missing");
  process.exit(1);
}
if (s.includes("order.creditFen ?? order.amountFen")) {
  console.log("notify already patched");
} else {
  s = s.replace(
    `const tx = await contract.depositByAdmin(
        usernameHash,
        BigInt(order.amountFen),
        ledgerOrderId,
      );`,
    `const creditFen = Number(order.creditFen ?? order.amountFen);
      if (!Number.isFinite(creditFen) || creditFen <= 0) {
        console.error("[zfm/notify] invalid creditFen", order.orderNo, order.creditFen);
        return new Response("fail", {
          status: 500,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      const tx = await contract.depositByAdmin(
        usernameHash,
        BigInt(creditFen),
        ledgerOrderId,
      );`,
  );
  s = s.replace(
    "amountFen: order.amountFen,",
    "amountFen: order.amountFen,\n      creditFen: order.creditFen ?? order.amountFen,",
  );
  fs.writeFileSync(p, s);
  console.log("notify patched");
}
