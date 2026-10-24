const fs=require("fs");
const path=require("path");
const root=process.cwd();
for (const line of fs.readFileSync(path.join(root,".env.local"),"utf8").split(/\r?\n/)) {
  const t=line.trim(); if(!t||t.startsWith("#")||!t.includes("=")) continue;
  const i=t.indexOf("="); const k=t.slice(0,i).trim(); const v=t.slice(i+1).trim();
  if(!(k in process.env)||!process.env[k]) process.env[k]=v;
}
(async()=>{
  const {Contract,FetchRequest,JsonRpcProvider}=require("ethers");
  const {HttpsProxyAgent}=require("https-proxy-agent");
  const rpc=process.env.LEDGER_RPC_URL;
  const proxy=process.env.XYSQ3_HTTPS_PROXY;
  const req=new FetchRequest(rpc);
  req.getUrlFunc=FetchRequest.createGetUrlFunc({agent:new HttpsProxyAgent(proxy)});
  const provider=new JsonRpcProvider(req,11155111);
  const addr=process.env.LEDGER_CONTRACT_ADDRESS;
  const abi=[
    "function operator() view returns (address)",
    "function usdt() view returns (address)",
    "function rateScaled() view returns (uint256)",
    "function quoteUsdtToFen(uint256) view returns (uint256)",
    "function depositUSDTToAccount(bytes32,uint256)",
  ];
  const c=new Contract(addr,abi,provider);
  const [op,usdt,rate,q]=await Promise.all([
    c.operator(), c.usdt(), c.rateScaled(), c.quoteUsdtToFen(1000000n)
  ]);
  console.log(JSON.stringify({address:addr,operator:op,usdt,rateScaled:rate.toString(),quote1usdtFen:q.toString(),fn:c.interface.getFunction("depositUSDTToAccount").format()},null,2));
})().catch(e=>{console.error(e);process.exit(1);});
