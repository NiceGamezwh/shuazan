const fs=require("fs");
const s=fs.readFileSync("app/account/page.tsx","utf8");
console.log("default10?", /useState\("10"\)/.test(s));
console.log("empty defaults", (s.match(/YuanInput\] = useState\(""\)/g)||[]).length);
