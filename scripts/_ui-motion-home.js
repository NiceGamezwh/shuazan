const fs = require("fs");
const p = "components/DouyinZone.tsx";
let s = fs.readFileSync(p, "utf8");

// Balance flash: track previous and apply class briefly via useEffect — add state near balanceFen
if (!s.includes("balanceFlash")) {
  s = s.replace(
    "const [discountBps, setDiscountBps] = useState(10000);",
    `const [discountBps, setDiscountBps] = useState(10000);
  const [balanceFlash, setBalanceFlash] = useState(false);
  const prevBalanceRef = useState<string | null>(null)[0] === null ? { current: null as string | null } : { current: null as string | null };`
  );
  // Better use useRef - fix properly
}

// Fix: do a clean insert with useRef
s = fs.readFileSync(p, "utf8");
if (!s.includes("useRef")) {
  s = s.replace(
    'import { useCallback, useEffect, useMemo, useState } from "react";',
    'import { useCallback, useEffect, useMemo, useRef, useState } from "react";'
  );
}
if (!s.includes("balanceFlash")) {
  s = s.replace(
    "const [discountBps, setDiscountBps] = useState(10000);",
    `const [discountBps, setDiscountBps] = useState(10000);
  const [balanceFlash, setBalanceFlash] = useState(false);
  const prevBalanceFen = useRef<string | null>(null);`
  );
}
if (!s.includes("prevBalanceFen.current")) {
  s = s.replace(
    "  useEffect(() => {\n    try {\n      const raw = localStorage.getItem(AUTH_STORAGE_KEY);",
    `  useEffect(() => {
    if (balanceFen == null) return;
    if (prevBalanceFen.current != null && prevBalanceFen.current !== balanceFen) {
      setBalanceFlash(true);
      const t = window.setTimeout(() => setBalanceFlash(false), 450);
      return () => window.clearTimeout(t);
    }
    prevBalanceFen.current = balanceFen;
  }, [balanceFen]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);`
  );
}

// Filter UI block
const oldFilter = `        <div className="flex flex-col gap-5 border-b border-[#292929] pb-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap gap-2"><span className="w-16 pt-2 font-ibm-mono text-[10px] text-[#666]">平台</span>{platforms.map((platform) => <button key={platform} onClick={() => { setActivePlatform(platform ?? "其他平台"); setActiveCategory("全部分类"); }} className={\`border px-3 py-2 font-ibm-mono text-[11px] transition \${activePlatform === platform ? "border-[#ffd600] bg-[#ffd600] text-[#0a0a0a]" : "border-[#333] text-[#888] hover:border-[#777]"}\`}>{platform}</button>)}</div>
            <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto"><span className="w-16 pt-2 font-ibm-mono text-[10px] text-[#666]">平台下分类</span>{availableCategories.map((category) => <button key={category} onClick={() => setActiveCategory(category)} className={\`border px-3 py-2 font-ibm-mono text-[11px] transition \${activeCategory === category ? "border-[#ffd600] bg-[#ffd600] text-[#0a0a0a]" : "border-[#333] text-[#888] hover:border-[#777]"}\`}>{category}</button>)}</div>
          </div>
          <label className="flex h-10 shrink-0 items-center gap-2 border border-[#333] px-3 text-[#666] focus-within:border-[#ffd600]"><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索服务名称 / 平台 / 分类" className="w-full bg-transparent font-ibm-mono text-xs text-[#f5f5f0] outline-none placeholder:text-[#555]" /></label>
        </div>`;

const newFilter = `        <div className="flex flex-col gap-6 border-b border-[#292929] pb-7 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="w-[4.5rem] shrink-0 font-ibm-mono text-xs font-semibold tracking-[1px] text-[#bbb]">平台</span>
              {platforms.map((platform) => (
                <button
                  key={platform}
                  type="button"
                  onClick={() => {
                    setActivePlatform(platform ?? "其他平台");
                    setActiveCategory("全部分类");
                  }}
                  className={\`nb-filter-chip rounded-sm px-4 py-2.5 font-grotesk text-sm md:text-base \${activePlatform === platform ? "is-active" : ""}\`}
                >
                  {platform}
                </button>
              ))}
            </div>
            <div className="nb-filter-scroll">
              <div className="flex max-h-32 flex-wrap items-center gap-2.5 overflow-y-auto pr-6">
                <span className="w-[4.5rem] shrink-0 font-ibm-mono text-xs font-semibold tracking-[1px] text-[#bbb]">分类</span>
                {availableCategories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setActiveCategory(category)}
                    className={\`nb-filter-chip rounded-sm px-3.5 py-2 font-grotesk text-sm \${activeCategory === category ? "is-active" : ""}\`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <label className="flex h-11 w-full shrink-0 items-center gap-2 border border-[#444] bg-[#121212] px-3 text-[#888] transition focus-within:border-[#ffd600] focus-within:text-[#ffd600] lg:mt-1 lg:w-[280px]">
            <Search className="h-4 w-4" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索服务名称 / 平台 / 分类"
              className="w-full bg-transparent font-ibm-mono text-sm text-[#f5f5f0] outline-none placeholder:text-[#666]"
            />
          </label>
        </div>`;

if (!s.includes(oldFilter)) {
  console.log("FILTER MISS");
} else {
  s = s.replace(oldFilter, newFilter);
  console.log("filter ok");
}

// Product grid + cards
const oldGrid = `        <div className="grid gap-px border border-[#292929] bg-[#292929] md:grid-cols-2 xl:grid-cols-4">
          {visibleProducts.map((product, index) => {
            const unit = formatMemberUnitPrice(product.price);
            return (
              <article key={product.id} className="group flex min-h-[310px] flex-col bg-[#101010] p-5 transition hover:bg-[#161616]">
                <div className="flex items-start justify-between">
                  <span className="font-ibm-mono text-[10px] text-[#555]">0{index + 1} / ID-{product.id}</span>
                  <div className="flex items-center gap-2">
                    {product.isClose === 1 && <span className="border border-[#6b3030] bg-[#2a1515] px-2 py-1 font-ibm-mono text-[9px] text-[#ff8b8b]">暂停购买</span>}
                    {product.tag && <span className="bg-[#242000] px-2 py-1 font-ibm-mono text-[9px] text-[#ffd600]">{product.tag}</span>}
                    {unit.hasDiscount && <span className="bg-[#0d1a12] px-2 py-1 font-ibm-mono text-[9px] text-[#4ade80]">会员价</span>}
                  </div>
                </div>
                <div className="mt-8 flex-1">
                  <div className="mb-3 font-ibm-mono text-[10px] tracking-[2px] text-[#666]">{product.category}</div>
                  <h2 className="text-xl font-bold leading-tight">{product.name}</h2>
                  <div className="mt-6 flex flex-wrap items-end gap-2">
                    <span className="text-3xl font-bold text-[#ffd600]">¥{unit.memberText}</span>
                    <span className="pb-1 font-ibm-mono text-[10px] text-[#666]">/ {product.unit}</span>
                    {unit.hasDiscount && (
                      <span className="pb-1 font-ibm-mono text-[11px] text-[#666] line-through">¥{unit.listText}</span>
                    )}
                  </div>
                </div>
                <div className="mb-4 flex items-center justify-between border-t border-[#292929] pt-4 font-ibm-mono text-[10px] text-[#777]">
                  <span>数量 {product.min.toLocaleString()} — {product.max.toLocaleString()}</span>
                  <span>{product.fields.length} 项参数</span>
                </div>
                <button
                  onClick={() => openOrder(product)}
                  disabled={product.isClose === 1}
                  className={\`flex h-11 items-center justify-between px-4 text-left text-xs font-bold tracking-[1px] transition \${product.isClose === 1 ? "cursor-not-allowed bg-[#292929] text-[#777]" : "bg-[#ffd600] text-[#0a0a0a] hover:bg-[#fff06a]"}\`}
                >
                  {product.isClose === 1 ? "暂停购买" : "立即下单"}{" "}
                  {product.isClose === 1 ? <span className="font-ibm-mono text-[10px]">暂不可用</span> : <ArrowRight className="h-4 w-4" />}
                </button>
              </article>
            );
          })}
        </div>`;

const newGrid = `        <div
          key={\`\${activePlatform}|\${activeCategory}|\${query}\`}
          className="nb-catalog-grid grid gap-px border border-[#292929] bg-[#292929] md:grid-cols-2 xl:grid-cols-4"
        >
          {visibleProducts.map((product, index) => {
            const unit = formatMemberUnitPrice(product.price);
            const delay = Math.min(index, 11) * 35;
            return (
              <article
                key={product.id}
                style={{ animationDelay: \`\${delay}ms\` }}
                className="nb-product-card nb-stagger-item group relative flex min-h-[310px] flex-col bg-[#101010] p-5"
              >
                <div className="flex items-start justify-between">
                  <span className="font-ibm-mono text-[10px] text-[#666]">0{index + 1} / ID-{product.id}</span>
                  <div className="flex items-center gap-2">
                    {product.isClose === 1 && <span className="border border-[#6b3030] bg-[#2a1515] px-2 py-1 font-ibm-mono text-[9px] text-[#ff8b8b]">暂停购买</span>}
                    {product.tag && <span className="nb-tag-pulse bg-[#242000] px-2 py-1 font-ibm-mono text-[9px] font-semibold text-[#ffd600]">{product.tag}</span>}
                    {unit.hasDiscount && <span className="bg-[#0d1a12] px-2 py-1 font-ibm-mono text-[9px] text-[#4ade80]">会员价</span>}
                  </div>
                </div>
                <div className="mt-8 flex-1">
                  <div className="mb-3 font-ibm-mono text-[10px] tracking-[2px] text-[#888]">{product.category}</div>
                  <h2 className="text-xl font-bold leading-tight transition group-hover:text-[#fff6a8]">{product.name}</h2>
                  <div className="mt-6 flex flex-wrap items-end gap-2">
                    <span className="text-3xl font-bold text-[#ffd600]">¥{unit.memberText}</span>
                    <span className="pb-1 font-ibm-mono text-[10px] text-[#777]">/ {product.unit}</span>
                    {unit.hasDiscount && (
                      <span className="pb-1 font-ibm-mono text-[11px] text-[#666] line-through">¥{unit.listText}</span>
                    )}
                  </div>
                </div>
                <div className="mb-4 flex items-center justify-between border-t border-[#292929] pt-4 font-ibm-mono text-[10px] text-[#888]">
                  <span>数量 {product.min.toLocaleString()} — {product.max.toLocaleString()}</span>
                  <span>{product.fields.length} 项参数</span>
                </div>
                <button
                  onClick={() => openOrder(product)}
                  disabled={product.isClose === 1}
                  className={\`nb-cta flex h-11 items-center justify-between px-4 text-left text-xs font-bold tracking-[1px] \${product.isClose === 1 ? "cursor-not-allowed bg-[#292929] text-[#777]" : "bg-[#ffd600] text-[#0a0a0a]"}\`}
                >
                  {product.isClose === 1 ? "暂停购买" : "立即下单"}{" "}
                  {product.isClose === 1 ? <span className="font-ibm-mono text-[10px]">暂不可用</span> : <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />}
                </button>
              </article>
            );
          })}
        </div>`;

if (!s.includes(oldGrid)) {
  console.log("GRID MISS");
} else {
  s = s.replace(oldGrid, newGrid);
  console.log("grid ok");
}

// Header sticky + balance flash + CTA classes
s = s.replace(
  'className="sticky top-0 z-20 border-b border-[#292929] bg-[#0a0a0a]/95 backdrop-blur"',
  'className="nb-header-bar sticky top-0 z-20 border-b border-[#292929] bg-[#0a0a0a]/95 backdrop-blur"'
);

s = s.replace(
  `{authUser} · ¥{balanceFen != null ? (Number(balanceFen) / 100).toFixed(2) : "…"}`,
  `{authUser} · <span className={balanceFlash ? "nb-balance-flash" : ""}>¥{balanceFen != null ? (Number(balanceFen) / 100).toFixed(2) : "…"}</span>`
);
// Wait - that puts HTML in JSX text wrongly. Need proper JSX.
s = s.replace(
  `{authUser} · <span className={balanceFlash ? "nb-balance-flash" : ""}>¥{balanceFen != null ? (Number(balanceFen) / 100).toFixed(2) : "…"}</span>`,
  `{authUser} ·{" "}
                  <span className={balanceFlash ? "nb-balance-flash font-bold" : "font-bold"}>
                    ¥{balanceFen != null ? (Number(balanceFen) / 100).toFixed(2) : "…"}
                  </span>`
);

s = s.replace(
  'className="bg-[#ffd600] px-4 py-2.5 text-xs font-bold tracking-[1px] text-[#0a0a0a] transition hover:bg-[#fff06a]"\n                >\n                  个人中心 / 充值',
  'className="nb-cta bg-[#ffd600] px-4 py-2.5 text-xs font-bold tracking-[1px] text-[#0a0a0a]"\n                >\n                  个人中心 / 充值'
);
s = s.replace(
  'className="bg-[#ffd600] px-5 py-2.5 text-xs font-bold tracking-[1px] text-[#0a0a0a] shadow-[0_0_24px_rgba(255,214,0,0.25)] transition hover:bg-[#fff06a]"\n                >\n                  注册 / 开始使用',
  'className="nb-cta bg-[#ffd600] px-5 py-2.5 text-xs font-bold tracking-[1px] text-[#0a0a0a] shadow-[0_0_24px_rgba(255,214,0,0.25)]"\n                >\n                  注册 / 开始使用'
);
s = s.replace(
  'className="bg-[#ffd600] px-6 py-3 text-xs font-bold text-[#0a0a0a] transition hover:bg-[#fff06a]"\n              >\n                立即登录 / 注册',
  'className="nb-cta bg-[#ffd600] px-6 py-3 text-xs font-bold text-[#0a0a0a]"\n              >\n                立即登录 / 注册'
);

// Feature cards
s = s.replace(
  '<section className="mx-auto grid max-w-[1440px] gap-4 px-5 pb-16 md:grid-cols-3 md:px-10"><div className="border border-[#292929] p-5"><ShieldCheck',
  '<section className="mx-auto grid max-w-[1440px] gap-4 px-5 pb-16 md:grid-cols-3 md:px-10"><div className="nb-feature-card border border-[#292929] p-5"><ShieldCheck'
);
s = s.replace(
  '</p></div><div className="border border-[#292929] p-5"><Clipboard',
  '</p></div><div className="nb-feature-card border border-[#292929] p-5"><Clipboard'
);
s = s.replace(
  '</p></div><div className="border border-[#292929] p-5"><Sparkles',
  '</p></div><div className="nb-feature-card border border-[#292929] p-5"><Sparkles'
);

// Pay confirm primary button if present
s = s.replace(
  'className={`px-6 py-3 text-xs font-bold text-[#0a0a0a] ${submitState === "loading" ? "cursor-not-allowed bg-[#9a8f3a]" : "bg-[#ffd600] hover:bg-[#fff06a]"}`}',
  'className={`nb-cta px-6 py-3 text-xs font-bold text-[#0a0a0a] ${submitState === "loading" ? "cursor-not-allowed bg-[#9a8f3a]" : "bg-[#ffd600]"}`}'
);

fs.writeFileSync(p, s);
console.log("DouyinZone patched, balanceFlash=", s.includes("balanceFlash"), "nb-filter=", s.includes("nb-filter-chip"));
