const fs=require("fs");
for (const f of ["app/account/page.tsx","components/DouyinZone.tsx"]) {
  const lines=fs.readFileSync(f,"utf8").split(/\n/);
  lines.forEach((l,i)=>{
    if (/无最低|任意金额|用多少充多少|walletYuanInput|alipayYuanInput = useState/.test(l))
      console.log(f+":"+(i+1)+":"+l.trim().slice(0,120));
  });
}
