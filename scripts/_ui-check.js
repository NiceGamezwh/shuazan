const fs=require("fs");
const a=fs.readFileSync("app/account/page.tsx","utf8");
console.log("nb-cta count", a.split("nb-cta").length-1);
console.log("membership btn ok", a.includes('nb-cta w-full px-4'));
const d=fs.readFileSync("components/DouyinZone.tsx","utf8");
console.log("platform label 分类", d.includes(">分类<"));
console.log("text-base chips", d.includes("md:text-base"));
