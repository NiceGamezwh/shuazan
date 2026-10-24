"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Clipboard, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import douyinCatalog from "./douyin-products.json";
import { applyDiscountFen, getTier, type MembershipLevel } from "@/lib/membership";

type ParamDef = {
  key: string;
  name: string;
  type?: number;
};

type Product = {
  id: number;
  name: string;
  platform?: string;
  category: string;
  price: string;
  unit: string;
  min: number;
  max: number;
  fields: ParamDef[];
  detail?: string;
  tag?: string;
  isClose: number;
};

type SubmitState = "idle" | "loading" | "success" | "error";

/** 展示价 / 扣款价 = 上游原价 × 此倍数 */
const PRICE_MULTIPLIER = 3;
const AUTH_STORAGE_KEY = "nobodys_auth_v1";

const products: Product[] = (douyinCatalog.info as Array<Record<string, unknown>>).map((item) => {
  const rawCategory = String(item.ClassName2 || "其他服务");
  const categoryMap: Record<string, string> = {
    "DY围绕评论": "围绕评论",
    "手功点攒": "手工点攒",
    "作品莞播": "作品播放",
    "DY商城": "商城服务",
  };
  const category = categoryMap[rawCategory] || rawCategory;
  const params = (() => {
    try {
      return JSON.parse(String(item.ParamsTemplate || "[]")) as Array<{
        key?: string;
        name?: string;
        description?: string;
        type?: number;
      }>;
    } catch {
      return [];
    }
  })();

  return {
    id: Number(item.Id),
    name: String(item.GoodsName || "未命名服务"),
    platform: String(item.ClassName1 || "其他平台"),
    category,
    price: (() => {
      const raw = Number(item.GoodsPrice || 0);
      const display = (Number.isFinite(raw) ? raw : 0) * PRICE_MULTIPLIER;
      // Keep enough decimals for tiny unit prices
      return display.toFixed(6).replace(/\.?0+$/, "") || "0";
    })(),
    unit: String(item.GoodsUnit || "个"),
    min: Number(item.MinOrderNum || 1),
    max: Number(item.MaxOrderNum || item.MinOrderNum || 1),
    fields: params.map((param, index) => ({
      key: String(param.key || `order${index}`),
      name: String(param.name || param.description || "下单参数"),
      type: param.type != null ? Number(param.type) : undefined,
    })),
    detail: String(item.GoodsDetail || "暂无商品详情"),
    tag: item.Lable ? String(item.Lable) : undefined,
    isClose: Number(item.IsClose || 2),
  };
});

const platforms = ["全部平台", ...Array.from(new Set(products.map((product) => product.platform)))];

function getCategoriesForPlatform(platform: string) {
  const scopedProducts = platform === "全部平台"
    ? products
    : products.filter((product) => product.platform === platform);
  return ["全部分类", ...Array.from(new Set(scopedProducts.map((product) => product.category)))];
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export default function DouyinZone() {
  const [activePlatform, setActivePlatform] = useState("全部平台");
  const [activeCategory, setActiveCategory] = useState("全部分类");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitMessage, setSubmitMessage] = useState("");
  const [upstreamInfo, setUpstreamInfo] = useState<unknown>(null);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<string | null>(null);
  const [balanceFen, setBalanceFen] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [showAuth, setShowAuth] = useState(false);
  const [showPayConfirm, setShowPayConfirm] = useState(false);
  const [membershipLevel, setMembershipLevel] = useState<MembershipLevel>(0);
  const [discountBps, setDiscountBps] = useState(10000);
  const [balanceFlash, setBalanceFlash] = useState(false);
  const prevBalanceFen = useRef<string | null>(null);


  const fetchMembership = useCallback(async (token: string) => {
    try {
      const res = await fetch("/api/ledger/membership", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok && data?.ok) {
        setMembershipLevel(Number(data.level || 0) as MembershipLevel);
        setDiscountBps(Number(data.discountBps || 10000));
      }
    } catch {
      /* keep defaults */
    }
  }, []);
  const refreshBalance = async (token: string) => {
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok && data?.ok) {
        setAuthUser(String(data.username));
        setBalanceFen(String(data.balanceFen ?? "0"));
        void fetchMembership(token);
        return true;
      }
      setAuthToken(null);
      setAuthUser(null);
      setBalanceFen(null);
      setMembershipLevel(0);
      setDiscountBps(10000);
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return false;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (balanceFen == null) return;
    if (prevBalanceFen.current != null && prevBalanceFen.current !== balanceFen) {
      setBalanceFlash(true);
      const t = window.setTimeout(() => setBalanceFlash(false), 450);
      prevBalanceFen.current = balanceFen;
      return () => window.clearTimeout(t);
    }
    prevBalanceFen.current = balanceFen;
  }, [balanceFen]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { token?: string; username?: string };
      if (parsed?.token) {
        setAuthToken(parsed.token);
        if (parsed.username) setAuthUser(parsed.username);
        void refreshBalance(parsed.token);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // 从个人中心返回时刷新会员档，使卡片价立刻更新
  useEffect(() => {
    const refresh = () => {
      try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as { token?: string };
        if (parsed?.token) {
          void refreshBalance(parsed.token);
          void fetchMembership(parsed.token);
        }
      } catch {
        /* ignore */
      }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchMembership]);

  const persistAuth = (token: string, username: string, balance?: string) => {
    setAuthToken(token);
    setAuthUser(username);
    if (balance != null) setBalanceFen(balance);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, username }));
  };

  const logout = () => {
    setAuthToken(null);
    setAuthUser(null);
    setBalanceFen(null);
    setMembershipLevel(0);
    setDiscountBps(10000);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setAuthMessage("已退出登录");
  };

  const doAuth = async (mode: "login" | "register") => {
    if (authBusy) return;
    const username = authUsername.trim();
    const password = authPassword;
    if (!username || !password) {
      setAuthMessage("请填写用户名和密码");
      return;
    }
    setAuthBusy(true);
    setAuthMessage(mode === "login" ? "登录中…" : "注册中，请稍候…");
    try {
      const res = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setAuthMessage(String(data?.error || `${mode} 失败`));
        return;
      }
      persistAuth(String(data.token), String(data.username || username), data.balanceFen != null ? String(data.balanceFen) : undefined);
      setAuthMessage(mode === "register" ? "注册成功" : "登录成功");
      await refreshBalance(String(data.token));
      setShowAuth(false);
      setAuthPassword("");
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "网络异常");
    } finally {
      setAuthBusy(false);
    }
  };

  const availableCategories = useMemo(() => getCategoriesForPlatform(activePlatform), [activePlatform]);

  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchPlatform = activePlatform === "全部平台" || product.platform === activePlatform;
    const matchCategory = activeCategory === "全部分类" || product.category === activeCategory;
    const matchQuery = !query || `${product.name}${product.platform}${product.category}`.toLowerCase().includes(query.toLowerCase());
    return matchPlatform && matchCategory && matchQuery;
  }), [activePlatform, activeCategory, query]);

  const openOrder = (product: Product) => {
    setSelected(product);
    setQuantity(String(product.min));
    setForm({});
    setSubmitState("idle");
    setSubmitMessage("");
    setUpstreamInfo(null);
    setShowPayConfirm(false);
  };

  const updateField = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const listTotalYuan = useMemo(() => {
    if (!selected) return 0;
    const qty = Number(quantity);
    if (!Number.isFinite(qty)) return 0;
    return qty * Number(selected.price);
  }, [selected, quantity]);

  const listFen = Math.round(listTotalYuan * 100);
  const needFen = Number(applyDiscountFen(listFen, discountBps));
  const estimatedTotalYuan = needFen / 100;
  const hasMemberDiscount = discountBps < 10000;

  const balanceYuan = balanceFen != null && Number.isFinite(Number(balanceFen))
    ? Number(balanceFen) / 100
    : null;

  const balanceSufficient =
    balanceFen != null && Number.isFinite(Number(balanceFen))
      ? Number(balanceFen) >= needFen
      : false;

  const membershipLabel = getTier(authToken ? membershipLevel : 0).discountLabel;
  const hasMemberDiscountGlobal = Boolean(authToken) && discountBps < 10000;

  /** Unit card price: apply discountBps when logged-in member. */
  const formatMemberUnitPrice = (listPriceStr: string) => {
    const list = Number(listPriceStr);
    if (!Number.isFinite(list) || list < 0) {
      return { listText: listPriceStr, memberText: listPriceStr, hasDiscount: false };
    }
    const member = hasMemberDiscountGlobal ? (list * discountBps) / 10000 : list;
    const fmt = (n: number) => {
      if (!Number.isFinite(n)) return String(listPriceStr);
      // preserve up to 6 significant decimals without trailing zeros explosion
      const t = n.toFixed(6).replace(/\.?0+$/, "");
      return t || "0";
    };
    return {
      listText: fmt(list),
      memberText: fmt(member),
      hasDiscount: hasMemberDiscountGlobal,
    };
  };

  /** 校验表单后打开支付确认弹窗，不立刻调下单 API */
  const requestPayConfirm = () => {
    if (!selected || submitState === "loading") return;
    if (!authToken || !authUser) {
      setSubmitState("error");
      setSubmitMessage("请先登录后再下单");
      setShowAuth(true);
      return;
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < selected.min || qty > selected.max) {
      setSubmitState("error");
      setSubmitMessage(`数量需在 ${selected.min} — ${selected.max} 之间`);
      return;
    }

    const missing = selected.fields.find((field) => !String(form[field.key] || "").trim());
    if (missing) {
      setSubmitState("error");
      setSubmitMessage(`请填写：${missing.name}`);
      return;
    }

    setSubmitState("idle");
    setSubmitMessage("");
    setUpstreamInfo(null);
    setShowPayConfirm(true);
  };

  /** 用户在弹窗内确认支付后再扣款+下单 */
  const confirmPay = async () => {
    if (!selected || !authToken || submitState === "loading") return;

    const qty = Number(quantity);
    setSubmitState("loading");
    setSubmitMessage("正在支付并提交订单…");
    setUpstreamInfo(null);

    try {
      const response = await fetch("/api/order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          goodsId: selected.id,
          quantity: qty,
          params: selected.fields.map((field) => ({
            name: field.name,
            key: field.key,
            value: String(form[field.key] || "").trim(),
            type: field.type,
          })),
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.ok) {
        setSubmitState("error");
        setSubmitMessage(String(data?.error || `下单失败（HTTP ${response.status}）`));
        setUpstreamInfo(data?.upstream ?? data);
        if (data?.balanceFen != null) setBalanceFen(String(data.balanceFen));
        // 余额不足时保留弹窗方便去充值；其他错误关闭支付弹窗回到订单表单看详情
        if (!String(data?.error || "").includes("余额不足")) {
          setShowPayConfirm(false);
        }
        return;
      }

      setShowPayConfirm(false);
      setSubmitState("success");
      setSubmitMessage("下单成功，余额已扣款");
      setUpstreamInfo(data?.upstream ?? data);
      if (data?.balanceFen != null) setBalanceFen(String(data.balanceFen));
      else if (authToken) void refreshBalance(authToken);
    } catch (error) {
      setShowPayConfirm(false);
      setSubmitState("error");
      setSubmitMessage(error instanceof Error ? error.message : "网络异常，下单失败");
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#f5f5f0] font-grotesk">
      <header className="nb-header-bar sticky top-0 z-20 border-b border-[#292929] bg-[#0a0a0a]/95 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-5 md:px-10">
          <div className="flex items-center gap-5">
            <a href="#top" className="flex items-center gap-3 text-sm font-bold tracking-[2px]"><img src="/logo.jpg" alt="Nobodys Logo" className="h-8 w-8 object-cover" />Nobodys</a>
            <span className="hidden border-l border-[#333] pl-5 font-ibm-mono text-[10px] tracking-[2px] text-[#666] md:block">SERVICE CATALOG / 2.0</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-[11px] font-ibm-mono text-[#888]">
            <span className="hidden items-center gap-2 sm:flex"><span className="h-2 w-2 bg-[#4ade80]" />系统运行中</span>
            {authUser ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <a
                  href="/account"
                  className="border border-[#3a3210] bg-[#171500] px-3 py-2.5 text-[#ffd600] transition hover:border-[#ffd600] hover:bg-[#1f1a00]"
                  title="个人中心 / 充值"
                >
                  {authUser} ·{" "}
                  <span className={balanceFlash ? "nb-balance-flash font-bold" : "font-bold"}>
                    ¥{balanceFen != null ? (Number(balanceFen) / 100).toFixed(2) : "…"}
                  </span>
                </a>
                <a
                  href="/account"
                  className="nb-cta bg-[#ffd600] px-4 py-2.5 text-xs font-bold tracking-[1px] text-[#0a0a0a]"
                >
                  个人中心 / 充值
                </a>
                <button onClick={logout} className="border border-[#3a3a3a] px-3 py-2.5 text-[#f5f5f0] transition hover:border-[#ffd600]">退出</button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  onClick={() => setShowAuth(true)}
                  className="border-2 border-[#ffd600] bg-transparent px-4 py-2.5 text-xs font-bold tracking-[1px] text-[#ffd600] transition hover:bg-[#171500]"
                >
                  登录
                </button>
                <button
                  onClick={() => setShowAuth(true)}
                  className="nb-cta bg-[#ffd600] px-5 py-2.5 text-xs font-bold tracking-[1px] text-[#0a0a0a] shadow-[0_0_24px_rgba(255,214,0,0.25)]"
                >
                  注册 / 开始使用
                </button>
                <a
                  href="/account"
                  className="hidden border border-[#3a3a3a] px-3 py-2.5 text-[#f5f5f0] transition hover:border-[#ffd600] md:inline-block"
                >
                  个人中心
                </a>
              </div>
            )}
            <a
              href="/admin"
              className="ml-1 px-2 py-2.5 text-[10px] tracking-[1px] text-[#555] transition hover:text-[#888]"
              title="管理"
            >
              管理
            </a>
          </div>
        </div>
      </header>

      <section id="top" className="border-b border-[#292929] bg-[#101010] px-5 py-12 md:px-10 md:py-20">
        <div className="mx-auto max-w-[1440px]">
          <div className="mb-7 flex items-center gap-3 font-ibm-mono text-[10px] tracking-[3px] text-[#ffd600]"><span className="h-px w-8 bg-[#ffd600]" /> SERVICE CATALOG / 02</div>
          <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-end">
            <div><h1 className="max-w-4xl text-5xl font-bold leading-[.95] tracking-[-3px] md:text-8xl">Nobodys<span className="text-[#ffd600]">.</span></h1><p className="mt-7 max-w-2xl font-ibm-mono text-sm leading-7 text-[#888]">Nobodys 服务。支持各类平台。粉丝，点赞，播放量等等。无最低充值限制，用多少充多少。</p></div>
            <div className="border-l-2 border-[#ffd600] pl-5 font-ibm-mono text-xs leading-6 text-[#888]"><div className="mb-2 text-[#f5f5f0]">[ SERVICE STATUS ]</div><div>AVAILABLE SERVICES <b className="text-[#ffd600]">{products.length.toString().padStart(2, "0")}</b></div><div>MINIMUM ORDER <b className="text-[#ffd600]">5+</b></div><div>RESPONSE TIME <b className="text-[#ffd600]">REALTIME</b></div></div>
          </div>
        </div>
      </section>

      {!authUser && (
        <section className="border-b border-[#3a3210] bg-[#171500] px-5 py-5 md:px-10">
          <div className="mx-auto flex max-w-[1440px] flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="mb-1 font-ibm-mono text-[10px] tracking-[2px] text-[#ffd600]">ACCOUNT REQUIRED</div>
              <p className="text-sm font-bold text-[#f5f5f0]">下单前请先登录或注册账号；可在个人中心充值后下单。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowAuth(true)}
                className="nb-cta bg-[#ffd600] px-6 py-3 text-xs font-bold text-[#0a0a0a]"
              >
                立即登录 / 注册
              </button>
              <a
                href="/account"
                className="border border-[#ffd600] px-5 py-3 text-xs font-bold text-[#ffd600] transition hover:bg-[#1f1a00]"
              >
                个人中心
              </a>
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-[1440px] px-5 py-8 md:px-10">
        <div className="flex flex-col gap-6 border-b border-[#292929] pb-7 lg:flex-row lg:items-start lg:justify-between">
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
                  className={`nb-filter-chip rounded-sm px-4 py-2.5 font-grotesk text-sm md:text-base ${activePlatform === platform ? "is-active" : ""}`}
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
                    className={`nb-filter-chip rounded-sm px-3.5 py-2 font-grotesk text-sm ${activeCategory === category ? "is-active" : ""}`}
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
        </div>

        <div className="mt-5 mb-3 border border-[#3a3210] bg-[#171500] px-4 py-2.5 font-ibm-mono text-[11px] leading-5 text-[#c7c2a0]">
          开通会员享折扣：普通9折 / 黄金8折 / 钻石6折 / 至尊5折。
          {hasMemberDiscountGlobal ? (
            <span className="text-[#4ade80]"> 当前已享{membershipLabel}。</span>
          ) : (
            <span> 未开通按原价。</span>
          )}
          {" "}详见{" "}
          <a href="/account" className="text-[#ffd600] underline hover:text-[#fff06a]">个人中心</a>
        </div>

        <div
          key={`${activePlatform}|${activeCategory}|${query}`}
          className="nb-catalog-grid grid gap-px border border-[#292929] bg-[#292929] md:grid-cols-2 xl:grid-cols-4"
        >
          {visibleProducts.map((product, index) => {
            const unit = formatMemberUnitPrice(product.price);
            const delay = Math.min(index, 11) * 35;
            return (
              <article
                key={product.id}
                style={{ animationDelay: `${delay}ms` }}
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
                  className={`nb-cta flex h-11 items-center justify-between px-4 text-left text-xs font-bold tracking-[1px] ${product.isClose === 1 ? "cursor-not-allowed bg-[#292929] text-[#777]" : "bg-[#ffd600] text-[#0a0a0a]"}`}
                >
                  {product.isClose === 1 ? "暂停购买" : "立即下单"}{" "}
                  {product.isClose === 1 ? <span className="font-ibm-mono text-[10px]">暂不可用</span> : <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />}
                </button>
              </article>
            );
          })}
        </div>
        {visibleProducts.length === 0 && <div className="border border-dashed border-[#333] py-20 text-center font-ibm-mono text-sm text-[#666]">没有匹配的服务</div>}
      </section>

      <section className="mx-auto grid max-w-[1440px] gap-4 px-5 pb-16 md:grid-cols-3 md:px-10"><div className="nb-feature-card border border-[#292929] p-5"><ShieldCheck className="mb-5 h-5 w-5 text-[#ffd600]" /><h3 className="mb-2 font-bold">参数透明</h3><p className="font-ibm-mono text-xs leading-6 text-[#777]">每个服务展示独立的数量范围和所需参数。</p></div><div className="nb-feature-card border border-[#292929] p-5"><Clipboard className="mb-5 h-5 w-5 text-[#ffd600]" /><h3 className="mb-2 font-bold">提交前核对</h3><p className="font-ibm-mono text-xs leading-6 text-[#777]">填写后先生成订单摘要，确认无误再提交。</p></div><div className="nb-feature-card border border-[#292929] p-5"><Sparkles className="mb-5 h-5 w-5 text-[#ffd600]" /><h3 className="mb-2 font-bold">实时处理</h3><p className="font-ibm-mono text-xs leading-6 text-[#777]">订单状态和服务响应信息集中展示。</p></div></section>


      {showAuth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={() => setShowAuth(false)}>
          <div className="w-full max-w-md border border-[#444] bg-[#111] p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between border-b border-[#292929] pb-4">
              <div>
                <div className="mb-1 font-ibm-mono text-[10px] tracking-[2px] text-[#ffd600]">ACCOUNT</div>
                <h2 className="text-xl font-bold">登录 / 注册</h2>
              </div>
              <button onClick={() => setShowAuth(false)} className="text-[#777] hover:text-[#fff]"><X /></button>
            </div>
            <p className="mb-4 font-ibm-mono text-[11px] leading-5 text-[#888]">请使用用户名和密码登录或注册。密码仅用于登录校验，不会明文展示。</p>
            <label className="mb-3 block">
              <span className="mb-2 block font-ibm-mono text-[11px] text-[#aaa]">用户名</span>
              <input value={authUsername} onChange={(e) => setAuthUsername(e.target.value)} className="w-full border border-[#333] bg-[#0a0a0a] p-3 font-ibm-mono text-xs text-[#f5f5f0] outline-none focus:border-[#ffd600]" />
            </label>
            <label className="mb-4 block">
              <span className="mb-2 block font-ibm-mono text-[11px] text-[#aaa]">密码</span>
              <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} className="w-full border border-[#333] bg-[#0a0a0a] p-3 font-ibm-mono text-xs text-[#f5f5f0] outline-none focus:border-[#ffd600]" />
            </label>
            {authMessage && <div className="mb-4 font-ibm-mono text-[11px] text-[#ffd600]">{authMessage}</div>}
            <div className="flex gap-3">
              <button disabled={authBusy} onClick={() => void doAuth("login")} className="flex-1 bg-[#ffd600] px-4 py-3 text-xs font-bold text-[#0a0a0a] disabled:opacity-60">登录</button>
              <button disabled={authBusy} onClick={() => void doAuth("register")} className="flex-1 border border-[#ffd600] px-4 py-3 text-xs font-bold text-[#ffd600] disabled:opacity-60">注册</button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/75 p-0 md:items-center md:p-6" onClick={() => { setShowPayConfirm(false); setSelected(null); }}>
          <div className="max-h-[90vh] w-full max-w-[620px] overflow-y-auto border border-[#444] bg-[#111] p-6 md:p-8" onClick={(event) => event.stopPropagation()}>
            <div className="mb-8 flex items-start justify-between border-b border-[#292929] pb-5">
              <div>
                <div className="mb-2 font-ibm-mono text-[10px] tracking-[2px] text-[#ffd600]">CREATE ORDER / ID-{selected.id}</div>
                <h2 className="text-2xl font-bold">{selected.name}</h2>
              </div>
              <button onClick={() => { setShowPayConfirm(false); setSelected(null); }} className="text-[#777] hover:text-[#fff]"><X /></button>
            </div>

            <section className="mb-6 border border-[#3a3210] bg-[#171500] p-4">
              <div className="mb-2 font-ibm-mono text-[10px] tracking-[2px] text-[#ffd600]">SERVICE DETAIL / 售后说明</div>
              <p className="whitespace-pre-wrap font-ibm-mono text-xs leading-6 text-[#c7c2a0]">{stripHtml(selected.detail || "暂无商品详情")}</p>
            </section>

            {submitState === "success" ? (
              <div className="border border-[#4ade80]/40 bg-[#102116] p-6">
                <div className="mb-3 flex items-center gap-2 text-[#4ade80]"><ShieldCheck className="h-5 w-5" />{submitMessage}</div>
                <p className="font-ibm-mono text-xs leading-6 text-[#aaa]">订单已提交至平台。如需继续下单，可关闭后重新选择服务。</p>
                {upstreamInfo != null && (
                  <pre className="mt-4 max-h-48 overflow-auto border border-[#2a3a2a] bg-[#0a120d] p-3 font-ibm-mono text-[10px] leading-5 text-[#9ad0a8]">{JSON.stringify(upstreamInfo, null, 2)}</pre>
                )}
                <button onClick={() => setSelected(null)} className="mt-6 bg-[#ffd600] px-5 py-3 text-xs font-bold text-[#0a0a0a]">返回服务目录</button>
              </div>
            ) : (
              <>
                <div className="space-y-5">
                  {selected.fields.map((field) => (
                    <label key={field.key} className="block">
                      <span className="mb-2 block font-ibm-mono text-[11px] text-[#aaa]">{field.name}<b className="ml-1 text-[#ffd600]">*</b></span>
                      <textarea
                        value={form[field.key] || ""}
                        onChange={(event) => updateField(field.key, event.target.value)}
                        rows={field.name.includes("评论") ? 4 : 2}
                        placeholder={`请输入${field.name}`}
                        className="w-full resize-none border border-[#333] bg-[#0a0a0a] p-3 font-ibm-mono text-xs text-[#f5f5f0] outline-none focus:border-[#ffd600]"
                      />
                    </label>
                  ))}
                  <label className="block">
                    <span className="mb-2 block font-ibm-mono text-[11px] text-[#aaa]">下单数量（{selected.min.toLocaleString()} — {selected.max.toLocaleString()}）<b className="ml-1 text-[#ffd600]">*</b></span>
                    <input
                      type="number"
                      min={selected.min}
                      max={selected.max}
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                      className="w-full border border-[#333] bg-[#0a0a0a] p-3 font-ibm-mono text-xs text-[#f5f5f0] outline-none focus:border-[#ffd600]"
                    />
                  </label>
                </div>

                {submitState === "error" && (
                  <div className="mt-5 border border-[#6b3030] bg-[#2a1515] p-4 font-ibm-mono text-xs leading-6 text-[#ff8b8b]">
                    {submitMessage}
                    {upstreamInfo != null && (
                      <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap text-[10px] text-[#ffc1c1]">{JSON.stringify(upstreamInfo, null, 2)}</pre>
                    )}
                  </div>
                )}
                {submitState === "loading" && <div className="mt-5 font-ibm-mono text-xs text-[#ffd600]">{submitMessage}</div>}

                <div className="mt-8 flex items-center justify-between border-t border-[#292929] pt-5">
                  <span className="font-ibm-mono text-[10px] text-[#666]">预计金额 <b className="text-[#ffd600]">¥{estimatedTotalYuan.toFixed(4)}</b></span>
                  <button
                    onClick={requestPayConfirm}
                    disabled={submitState === "loading"}
                    className={`nb-cta px-6 py-3 text-xs font-bold text-[#0a0a0a] ${submitState === "loading" ? "cursor-not-allowed bg-[#9a8f3a]" : "bg-[#ffd600]"}`}
                  >
                    {submitState === "loading" ? "支付中…" : "提交订单"} <ArrowRight className="ml-2 inline h-4 w-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showPayConfirm && selected && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => {
            if (submitState !== "loading") setShowPayConfirm(false);
          }}
        >
          <div
            className="w-full max-w-md border border-[#444] bg-[#111] p-6 shadow-[0_0_40px_rgba(0,0,0,0.5)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between border-b border-[#292929] pb-4">
              <div>
                <div className="mb-1 font-ibm-mono text-[10px] tracking-[2px] text-[#ffd600]">CONFIRM PAYMENT</div>
                <h2 className="text-xl font-bold">确认支付</h2>
              </div>
              <button
                disabled={submitState === "loading"}
                onClick={() => setShowPayConfirm(false)}
                className="text-[#777] hover:text-[#fff] disabled:opacity-40"
              >
                <X />
              </button>
            </div>

            <div className="space-y-3 border border-[#292929] bg-[#0a0a0a] p-4 font-ibm-mono text-xs">
              <div className="flex items-start justify-between gap-4">
                <span className="shrink-0 text-[#666]">商品</span>
                <span className="text-right font-bold text-[#f5f5f0]">{selected.name}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[#666]">数量</span>
                <span className="text-[#f5f5f0]">{Number(quantity).toLocaleString()} {selected.unit}</span>
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-[#222] pt-3">
                <span className="text-[#666]">标价</span>
                <span className={`text-[#f5f5f0] ${hasMemberDiscount ? "line-through opacity-60" : ""}`}>
                  ¥{listTotalYuan.toFixed(4)}
                </span>
              </div>
              {hasMemberDiscount && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[#666]">会员价</span>
                  <span className="text-[#4ade80]">{membershipLabel}</span>
                </div>
              )}
              {!hasMemberDiscount && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[#666]">计价</span>
                  <span className="text-[#aaa]">原价（无会员折扣）</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-4">
                <span className="text-[#666]">应付金额</span>
                <span className="text-lg font-bold text-[#ffd600]">¥{estimatedTotalYuan.toFixed(4)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[#666]">当前余额</span>
                <span className="text-[#f5f5f0]">
                  {balanceYuan != null ? `¥${balanceYuan.toFixed(2)}` : "—"}
                </span>
              </div>
            </div>

            {balanceFen == null ? (
              <div className="mt-4 border border-[#3a3210] bg-[#171500] p-3 font-ibm-mono text-[11px] leading-5 text-[#c7c2a0]">
                正在读取余额…
              </div>
            ) : balanceSufficient ? (
              <div className="mt-4 border border-[#1a3a24] bg-[#0d1a12] p-3 font-ibm-mono text-[11px] leading-5 text-[#4ade80]">
                余额充足，确认后将扣款并提交订单。
              </div>
            ) : (
              <div className="mt-4 border border-[#6b3030] bg-[#2a1515] p-3 font-ibm-mono text-[11px] leading-5 text-[#ff8b8b]">
                余额不足（还需约 ¥{Math.max(0, estimatedTotalYuan - (balanceYuan ?? 0)).toFixed(4)}）。
                请先前往{' '}
                <a href="/account" className="underline text-[#ffd600] hover:text-[#fff06a]">个人中心充值</a>
                {' '}（无最低额度，用多少充多少）后再支付。
              </div>
            )}

            {submitState === "error" && submitMessage && (
              <div className="mt-3 border border-[#6b3030] bg-[#2a1515] p-3 font-ibm-mono text-[11px] leading-5 text-[#ff8b8b]">
                {submitMessage}
                {String(submitMessage).includes("余额不足") && (
                  <div className="mt-2">
                    <a href="/account" className="underline text-[#ffd600] hover:text-[#fff06a]">前往充值 →</a>
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                disabled={submitState === "loading"}
                onClick={() => setShowPayConfirm(false)}
                className="flex-1 border border-[#3a3a3a] px-4 py-3 text-xs font-bold text-[#f5f5f0] transition hover:border-[#777] disabled:opacity-50"
              >
                取消
              </button>
              <button
                disabled={submitState === "loading" || !balanceSufficient}
                onClick={() => void confirmPay()}
                className={`flex-1 px-4 py-3 text-xs font-bold text-[#0a0a0a] transition ${
                  submitState === "loading" || !balanceSufficient
                    ? "cursor-not-allowed bg-[#9a8f3a] opacity-70"
                    : "bg-[#ffd600] hover:bg-[#fff06a]"
                }`}
              >
                {submitState === "loading" ? "支付中…" : "确认支付"}
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
