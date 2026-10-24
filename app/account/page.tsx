"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  RefreshCw,
  ShieldCheck,
  LogIn,
  LogOut,
  X,
  Receipt,
  CreditCard,
  Crown,
  Sparkles,
} from "lucide-react";
import { fenToYuan, hashUsernameClient } from "@/lib/ledger-browser";
import { alipayPayFen, fenToYuanStr, tryParseYuanToFen } from "@/lib/recharge-pricing";
import { MEMBERSHIP_TIERS, fenToYuanLabel, getTier, type MembershipLevel } from "@/lib/membership";

const AUTH_STORAGE_KEY = "nobodys_auth_v1";

type AuthState = {
  token: string | null;
  username: string | null;
  usernameHash: string | null;
  balanceFen: string | null;
};

type LedgerEventRow = {
  type: "Consumed" | "Deposited" | "UsdtDepositedToAccount";
  label: string;
  txHash: string;
  blockNumber: number;
  amountFen: string;
  amountRmb: string;
  orderId: string | null;
  orderIdShort: string | null;
  usdtAmount: string | null;
  timestamp: number | null;
};

type OrdersTab = "all" | "consume" | "deposit";

function formatEventTime(ts: number | null, blockNumber: number): string {
  if (ts != null && ts > 0) {
    try {
      return new Date(ts * 1000).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      /* fallthrough */
    }
  }
  return blockNumber > 0 ? `区块 #${blockNumber}` : "—";
}

export default function AccountPage() {
  const [auth, setAuth] = useState<AuthState>({
    token: null,
    username: null,
    usernameHash: null,
    balanceFen: null,
  });
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [showAuth, setShowAuth] = useState(false);

  /** 支付宝充值：人民币元 */
  const [alipayYuanInput, setAlipayYuanInput] = useState("");
  const [depositBusy, setDepositBusy] = useState(false);
  const [depositMessage, setDepositMessage] = useState("");
  const [zfmOrderNo, setZfmOrderNo] = useState<string | null>(null);
  const [zfmPayUrl, setZfmPayUrl] = useState<string | null>(null);
  const [mockNotifyEnabled, setMockNotifyEnabled] = useState(false);

  const [ordersTab, setOrdersTab] = useState<OrdersTab>("all");
  const [orders, setOrders] = useState<LedgerEventRow[]>([]);
  const [ordersBusy, setOrdersBusy] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [ordersMeta, setOrdersMeta] = useState<{
    fromBlock: number;
    toBlock: number;
    fromBlockSource: string;
  } | null>(null);

  const [membershipLevel, setMembershipLevel] = useState<MembershipLevel>(0);
  const [membershipBusy, setMembershipBusy] = useState(false);
  const [membershipMessage, setMembershipMessage] = useState("");
  const [membershipTiers, setMembershipTiers] = useState(MEMBERSHIP_TIERS.filter((t) => t.level > 0));

  const alipayCreditFen = tryParseYuanToFen(alipayYuanInput);
  const alipayPayableFen = alipayCreditFen > 0 ? alipayPayFen(alipayCreditFen) : 0;

  const fetchMembership = useCallback(async (token: string) => {
    try {
      const res = await fetch("/api/ledger/membership", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        if (res.status !== 401) {
          setMembershipMessage(String(data?.error || "加载会员失败"));
        }
        return;
      }
      setMembershipLevel(Number(data.level || 0) as MembershipLevel);
      if (Array.isArray(data.tiers) && data.tiers.length) {
        setMembershipTiers(
          data.tiers.map((t: Record<string, unknown>) => ({
            level: Number(t.level) as MembershipLevel,
            id: String(t.id) as "basic" | "gold" | "diamond" | "supreme",
            name: String(t.name),
            priceFen: Number(t.priceFen),
            priceYuan: String(t.priceYuan),
            discountBps: Number(t.discountBps),
            discountLabel: String(t.discountLabel),
            perkShort: String(t.perkShort || ""),
            perkLong: t.perkLong ? String(t.perkLong) : undefined,
            costMultiplier: Number(t.costMultiplier ?? 3),
            upgradePriceFen: Number(t.upgradePriceFen ?? t.priceFen ?? 0),
            upgradePriceYuan: String(t.upgradePriceYuan ?? t.priceYuan ?? ""),
            canPurchase: Boolean(t.canPurchase),
          })),
        );
      }
      setMembershipMessage("");
    } catch (e) {
      setMembershipMessage(e instanceof Error ? e.message : "网络异常");
    }
  }, []);

  const refreshMe = useCallback(async (token: string) => {
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      setAuth({ token: null, username: null, usernameHash: null, balanceFen: null });
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return false;
    }
    const username = String(data.username);
    setAuth({
      token,
      username,
      usernameHash: String(data.usernameHash || hashUsernameClient(username)),
      balanceFen: String(data.balanceFen ?? "0"),
    });
    void fetchMembership(token);
    return true;
  }, [fetchMembership]);

  const fetchOrders = useCallback(
    async (token: string, tab: OrdersTab = ordersTab) => {
      setOrdersBusy(true);
      setOrdersError("");
      try {
        const typeQ =
          tab === "consume" ? "consume" : tab === "deposit" ? "deposit" : "all";
        const res = await fetch(
          `/api/ledger/orders?limit=50&type=${encodeURIComponent(typeQ)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          },
        );
        const data = await res.json();
        if (!res.ok || !data?.ok) {
          if (res.status === 401) {
            setOrders([]);
            setOrdersError("请先登录后查看订单记录");
          } else {
            setOrders([]);
            setOrdersError(String(data?.error || "加载订单记录失败"));
          }
          return;
        }
        setOrders(Array.isArray(data.events) ? data.events : []);
        setOrdersMeta({
          fromBlock: Number(data.fromBlock ?? 0),
          toBlock: Number(data.toBlock ?? 0),
          fromBlockSource: String(data.fromBlockSource || ""),
        });
      } catch (e) {
        setOrders([]);
        setOrdersError(e instanceof Error ? e.message : "网络异常");
      } finally {
        setOrdersBusy(false);
      }
    },
    [ordersTab],
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { token?: string; username?: string };
      if (parsed?.token) {
        setAuth((s) => ({
          ...s,
          token: parsed.token!,
          username: parsed.username || null,
          usernameHash: parsed.username ? hashUsernameClient(parsed.username) : null,
        }));
        void refreshMe(parsed.token);
      }
    } catch {
      /* ignore */
    }
  }, [refreshMe]);

  useEffect(() => {
    if (!auth.token) {
      setOrders([]);
      setOrdersMeta(null);
      setOrdersError("");
      return;
    }
    void fetchOrders(auth.token, ordersTab);
  }, [auth.token, ordersTab, fetchOrders]);

  const persistAuth = (token: string, username: string, balance?: string) => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, username }));
    setAuth({
      token,
      username,
      usernameHash: hashUsernameClient(username),
      balanceFen: balance != null ? balance : auth.balanceFen,
    });
  };

  const logout = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setAuth({ token: null, username: null, usernameHash: null, balanceFen: null });
    setOrders([]);
    setOrdersMeta(null);
    setOrdersError("");
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
        const code = String(data?.code || "");
        if (mode === "login" && code === "NOT_REGISTERED") {
          setAuthMessage(
            String(data?.error || "用户未注册，请先点击「注册」完成开户。"),
          );
        } else if (mode === "login" && code === "WRONG_PASSWORD") {
          setAuthMessage("密码错误，请重试（注意大小写与特殊字符，前后空格不会被去掉）");
        } else {
          setAuthMessage(String(data?.error || `${mode} 失败`));
        }
        return;
      }
      persistAuth(
        String(data.token),
        String(data.username || username),
        data.balanceFen != null ? String(data.balanceFen) : undefined,
      );
      setAuthMessage(mode === "register" ? "注册成功" : "登录成功");
      setShowAuth(false);
      setAuthPassword("");
      await refreshMe(String(data.token));
    } catch (e) {
      setAuthMessage(e instanceof Error ? e.message : "网络异常");
    } finally {
      setAuthBusy(false);
    }
  };

  const runAlipayCreate = async () => {
    if (depositBusy) return;
    if (!auth.token) {
      setShowAuth(true);
      setDepositMessage("请先登录账号");
      return;
    }
    const yuan = alipayYuanInput.trim();
    if (!yuan || !/^\d+(\.\d{1,2})?$/.test(yuan) || Number(yuan) <= 0) {
      setDepositMessage("请输入大于 0 的人民币金额（最多两位小数）");
      return;
    }
    setDepositBusy(true);
    setDepositMessage("正在创建支付宝订单…");
    try {
      const res = await fetch("/api/pay/zfm/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({ amountYuan: yuan }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setDepositMessage(String(data?.error || data?.hint || "创建订单失败"));
        return;
      }
      setZfmOrderNo(String(data.orderNo));
      setZfmPayUrl(data.payUrl ? String(data.payUrl) : null);
      setMockNotifyEnabled(Boolean(data.mockNotifyEnabled));
      if (data.mockNotifyEnabled && (data.usingPlaceholderNotify || data.localMockOnly || !data.payUrl)) {
        setDepositMessage(
          String(data.tip || "订单已创建。本地测试可点「本地测试」到账，或打开支付页完成付款。"),
        );
      } else {
        setDepositMessage(
          String(data.tip || "订单已创建，请在新窗口完成支付宝付款；付完后点「我已支付」刷新余额。"),
        );
      }
      if (typeof window !== "undefined" && data.payUrl) {
        window.open(String(data.payUrl), "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      setDepositMessage(e instanceof Error ? e.message : "网络异常");
    } finally {
      setDepositBusy(false);
    }
  };

  const refreshAfterPay = async () => {
    if (!auth.token) return;
    setDepositMessage("正在刷新余额…");
    await refreshMe(auth.token);
    if (zfmOrderNo) {
      try {
        const res = await fetch(
          `/api/pay/zfm/status?orderNo=${encodeURIComponent(zfmOrderNo)}`,
          { headers: { Authorization: `Bearer ${auth.token}` }, cache: "no-store" },
        );
        const data = await res.json();
        if (data?.ok && data.status === "paid") {
          setDepositMessage(`支付宝到账成功：¥${data.creditYuan || data.amountYuan}。余额已更新。`);
          await refreshMe(auth.token);
          return;
        }
        if (data?.ok) {
          setDepositMessage(
            `订单状态：${data.status}。若刚付完请稍候，或点「我已支付」再刷新。`,
          );
          return;
        }
      } catch {
        /* ignore */
      }
    }
    setDepositMessage("余额已刷新。若已付款仍未到账，请稍后再试或联系客服。");
  };

  const runMockNotify = async () => {
    if (!auth.token || !zfmOrderNo) return;
    setDepositBusy(true);
    try {
      const res = await fetch("/api/pay/zfm/mock-notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({ orderNo: zfmOrderNo }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setDepositMessage(String(data?.error || "本地测试失败"));
        return;
      }
      setDepositMessage("本地测试到账成功，余额已更新。");
      await refreshMe(auth.token);
    } catch (e) {
      setDepositMessage(e instanceof Error ? e.message : "本地测试异常");
    } finally {
      setDepositBusy(false);
    }
  };

  const purchaseMembership = async (level: number) => {
    if (membershipBusy || !auth.token) return;
    if (level <= membershipLevel) {
      setMembershipMessage("会员只能升级不能降级；当前已是同等或更高档位");
      return;
    }
    setMembershipBusy(true);
    setMembershipMessage("正在开通会员（扣余额）…");
    try {
      const res = await fetch("/api/ledger/membership", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({ level }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setMembershipMessage(String(data?.error || "购买失败"));
        return;
      }
      setMembershipLevel(Number(data.level || level) as MembershipLevel);
      if (data.balanceFen != null) {
        setAuth((prev) => ({ ...prev, balanceFen: String(data.balanceFen) }));
      }
      setMembershipMessage(
        `开通成功：${data.name || getTier(level).name}（${data.discountLabel || ""}）`,
      );
      await fetchMembership(auth.token);
      await refreshMe(auth.token);
    } catch (e) {
      setMembershipMessage(e instanceof Error ? e.message : "网络异常");
    } finally {
      setMembershipBusy(false);
    }
  };

  const currentTier = getTier(membershipLevel);

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#f5f5f0] font-grotesk">
      <header className="sticky top-0 z-20 border-b border-[#292929] bg-[#0a0a0a]/95 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-[960px] items-center justify-between px-5">
          <Link
            href="/"
            className="flex items-center gap-2 font-ibm-mono text-[11px] tracking-[1.5px] text-[#888] transition hover:text-[#ffd600]"
          >
            <ArrowLeft className="h-4 w-4" /> 返回服务目录
          </Link>
          <div className="flex items-center gap-3">
            {auth.username ? (
              <>
                <span className="hidden font-ibm-mono text-[11px] text-[#f5f5f0] sm:inline">
                  {auth.username}
                </span>
                <button
                  onClick={logout}
                  className="flex items-center gap-1 border border-[#3a3a3a] px-3 py-2 font-ibm-mono text-[11px] transition hover:border-[#ffd600]"
                >
                  <LogOut className="h-3.5 w-3.5" /> 退出
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                className="flex items-center gap-2 bg-[#ffd600] px-5 py-2.5 text-xs font-bold text-[#0a0a0a] transition "
              >
                <LogIn className="h-4 w-4" /> 登录 / 注册
              </button>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[960px] px-5 py-10 md:py-14">
        <div className="mb-3 font-ibm-mono text-[10px] tracking-[3px] text-[#ffd600]">
          ACCOUNT / RECHARGE
        </div>
        <h1 className="text-4xl font-bold tracking-[-1px] md:text-5xl">
          个人中心<span className="text-[#ffd600]">.</span>
        </h1>
        <p className="mt-4 max-w-2xl font-ibm-mono text-sm leading-7 text-[#888]">
          充值请输入<strong className="text-[#f5f5f0]">充值金额</strong>：支付宝含 3%
          手续费。无最低额度，建议用多少充多少。
        </p>

        {!auth.username ? (
          <div className="mt-10 border border-[#3a3210] bg-[#171500] p-8 text-center">
            <ShieldCheck className="mx-auto mb-4 h-8 w-8 text-[#ffd600]" />
            <h2 className="mb-2 text-xl font-bold">请先登录账号</h2>
            <p className="mb-6 font-ibm-mono text-xs leading-6 text-[#a89f6a]">
              充值成功后计入账户余额，下单时优先扣此余额。
            </p>
            <button
              onClick={() => setShowAuth(true)}
              className="bg-[#ffd600] px-8 py-3.5 text-sm font-bold text-[#0a0a0a] transition "
            >
              立即登录 / 注册
            </button>
          </div>
        ) : (
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <div className="nb-account-card border border-[#292929] bg-[#101010] p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="font-ibm-mono text-[10px] tracking-[2px] text-[#666]">
                  ACCOUNT BALANCE
                </div>
                <button
                  onClick={() => auth.token && void refreshMe(auth.token)}
                  className="flex items-center gap-1 font-ibm-mono text-[10px] text-[#888] hover:text-[#ffd600]"
                  title="刷新余额"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> 刷新
                </button>
              </div>
              <div className="mb-1 font-ibm-mono text-[11px] text-[#888]">用户名</div>
              <div className="mb-5 text-lg font-bold">{auth.username}</div>
              <div className="mb-1 font-ibm-mono text-[11px] text-[#888]">账号余额（可下单）</div>
              <div className="text-4xl font-bold text-[#ffd600]">
                ¥{auth.balanceFen != null ? fenToYuan(auth.balanceFen) : "…"}
              </div>
              <div className="mt-2 font-ibm-mono text-[10px] leading-5 text-[#777]">
                余额充值不退，充值无最低额度，因此建议用多少充多少（大于 0 即可）。
              </div>
            </div>

            <div className="nb-account-card border border-[#292929] bg-[#101010] p-6">
              <div className="mb-4 font-ibm-mono text-[10px] tracking-[2px] text-[#666]">
                RECHARGE / 人民币充值
              </div>
              <div className="mb-4 border border-[#3a3210] bg-[#171500] px-3 py-2.5 font-ibm-mono text-[11px] leading-5 text-[#ffd600]">
                <b>无最低充值限制</b>：建议用多少充多少，金额大于 0 即可（最多两位小数）。
              </div>

              <div className="mb-4 flex items-center gap-2 font-ibm-mono text-xs font-semibold text-[#ffd600]">
                <CreditCard className="h-3.5 w-3.5" /> 支付宝充值
              </div>

              <label className="mb-3 block">
                <span className="mb-2 block font-ibm-mono text-[11px] text-[#aaa]">
                  充值金额（人民币 · 元）
                </span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-ibm-mono text-sm text-[#ffd600]">
                    ¥
                  </span>
                  <input
                    value={alipayYuanInput}
                    onChange={(e) => setAlipayYuanInput(e.target.value)}
                    inputMode="decimal"
                    placeholder="任意金额，大于 0"
                    className="w-full border border-[#333] bg-[#0a0a0a] py-3 pl-8 pr-3 font-ibm-mono text-sm text-[#f5f5f0] outline-none focus:border-[#ffd600]"
                  />
                </div>
              </label>

              <div className="mb-5 border border-[#3a3210] bg-[#171500] p-4 font-ibm-mono text-xs leading-6 text-[#c7c2a0]">
                <div>
                  到账{" "}
                  <b className="text-[#ffd600]">¥{alipayCreditFen > 0 ? fenToYuanStr(alipayCreditFen) : "—"}</b>
                </div>
                <div className="mt-1">
                  应付{" "}
                  <b className="text-[#ffd600]">¥{alipayPayableFen > 0 ? fenToYuanStr(alipayPayableFen) : "—"}</b>
                  <span className="text-[#888]">（含 3% 手续费）</span>
                </div>
              </div>

              <button
                disabled={depositBusy}
                onClick={() => void runAlipayCreate()}
                className={`mb-3 flex w-full items-center justify-center gap-2 px-4 py-3.5 text-sm font-bold text-[#0a0a0a] transition ${
                  depositBusy ? "cursor-not-allowed bg-[#9a8f3a]" : "nb-cta bg-[#ffd600]"
                }`}
              >
                {depositBusy ? "处理中…" : "支付宝充值"}
              </button>

              <div className="flex flex-wrap gap-2">
                {zfmPayUrl && (
                  <a
                    href={zfmPayUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border border-[#ffd600] px-3 py-2 font-ibm-mono text-[11px] text-[#ffd600] hover:bg-[#171500]"
                  >
                    重新打开支付页
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => void refreshAfterPay()}
                  className="border border-[#333] px-3 py-2 font-ibm-mono text-[11px] text-[#aaa] hover:border-[#ffd600] hover:text-[#ffd600]"
                >
                  我已支付 / 刷新余额
                </button>
                {mockNotifyEnabled && zfmOrderNo && (
                  <button
                    type="button"
                    disabled={depositBusy}
                    onClick={() => void runMockNotify()}
                    className="border border-[#664] px-3 py-2 font-ibm-mono text-[11px] text-[#c7a] hover:border-[#ffd600]"
                  >
                    本地测试
                  </button>
                )}
              </div>
              {zfmOrderNo && (
                <div className="mt-3 font-ibm-mono text-[10px] text-[#555]">
                  订单号 {zfmOrderNo}
                </div>
              )}

              {depositMessage && (
                <div className="mt-4 font-ibm-mono text-[11px] leading-5 text-[#ffd600]">
                  {depositMessage}
                </div>
              )}

            </div>
          </div>
        )}

        {auth.username && (
          <div className="mt-8 border border-[#292929] bg-[#101010] p-6">
            <div className="mb-2 flex items-center gap-2">
              <Crown className="h-4 w-4 text-[#ffd600]" />
              <div className="font-ibm-mono text-[10px] tracking-[2px] text-[#666]">
                MEMBERSHIP
              </div>
            </div>
            <h2 className="mb-2 text-lg font-bold">永久会员</h2>
            <p className="mb-5 font-ibm-mono text-xs leading-6 text-[#888]">
              当前：
              <b className="text-[#ffd600]">{currentTier.name}</b>
              {" · "}
              {currentTier.discountLabel}
              。开通会员享永久折扣：普通9折 / 黄金8折 / 钻石6折 / 至尊5折。升级只付差价；至尊权益由运营人工兑现。
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              {membershipTiers.map((tier) => {
                const isCurrent = tier.level === membershipLevel;
                const canBuy = tier.level > membershipLevel;
                const isSupreme = tier.level === 4;
                return (
                  <div
                    key={tier.level}
                    className={`nb-account-card border p-5 ${
                      isCurrent
                        ? "border-[#ffd600] bg-[#171500]"
                        : "border-[#292929] bg-[#0a0a0a]"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isSupreme ? (
                          <Sparkles className="h-4 w-4 text-[#ffd600]" />
                        ) : (
                          <Crown className="h-4 w-4 text-[#888]" />
                        )}
                        <h3 className="text-base font-bold">{tier.name}</h3>
                      </div>
                      {isCurrent && (
                        <span className="bg-[#ffd600] px-2 py-0.5 font-ibm-mono text-[9px] font-bold text-[#0a0a0a]">
                          当前档位
                        </span>
                      )}
                    </div>
                    <div className="mb-1 text-2xl font-bold text-[#ffd600]">
                      ¥{tier.priceYuan}
                      <span className="ml-2 font-ibm-mono text-[11px] font-normal text-[#888]">
                        {tier.discountLabel}
                      </span>
                    </div>
                    {canBuy && Number((tier as { upgradePriceFen?: number }).upgradePriceFen ?? tier.priceFen) < tier.priceFen && (
                      <div className="mb-2 font-ibm-mono text-[11px] text-[#4ade80]">
                        升级补差 ¥{(tier as { upgradePriceYuan?: string }).upgradePriceYuan || fenToYuanLabel((tier as { upgradePriceFen?: number }).upgradePriceFen ?? 0)}
                        <span className="text-[#666]">（标价 ¥{tier.priceYuan} − 已付档位）</span>
                      </div>
                    )}
                    <p className="mb-3 font-ibm-mono text-[11px] leading-5 text-[#aaa]">
                      {tier.perkShort}
                    </p>
                    {tier.perkLong && (
                      <ul className="mb-4 list-disc space-y-1 pl-4 font-ibm-mono text-[10px] leading-5 text-[#888]">
                        {tier.perkLong.split("\n").map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    )}
                    <button
                      type="button"
                      disabled={membershipBusy || !canBuy}
                      onClick={() => void purchaseMembership(tier.level)}
                      className={`nb-cta w-full px-4 py-2.5 text-xs font-bold ${
                        !canBuy
                          ? "cursor-not-allowed bg-[#292929] text-[#777]"
                          : membershipBusy
                            ? "cursor-not-allowed bg-[#9a8f3a] text-[#0a0a0a]"
                            : "bg-[#ffd600] text-[#0a0a0a]"
                      }`}
                    >
                      {isCurrent
                        ? "已开通"
                        : !canBuy
                          ? "不可降级"
                          : membershipBusy
                            ? "处理中…"
                            : Number((tier as { upgradePriceFen?: number }).upgradePriceFen ?? tier.priceFen) < tier.priceFen
                              ? `升级补差 ¥${(tier as { upgradePriceYuan?: string }).upgradePriceYuan || fenToYuanLabel((tier as { upgradePriceFen?: number }).upgradePriceFen ?? 0)}`
                              : `开通 ¥${tier.priceYuan}`}
                    </button>
                  </div>
                );
              })}
            </div>

            {membershipMessage && (
              <div className="mt-4 font-ibm-mono text-[11px] leading-5 text-[#ffd600]">
                {membershipMessage}
              </div>
            )}
          </div>
        )}

        {auth.username && (
          <div className="mt-8 border border-[#292929] bg-[#101010] p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-[#ffd600]" />
                <div>
                  <div className="font-ibm-mono text-[10px] tracking-[2px] text-[#666]">
                    ORDERS / HISTORY
                  </div>
                  <h2 className="text-lg font-bold">订单记录</h2>
                </div>
              </div>
              <button
                onClick={() => auth.token && void fetchOrders(auth.token, ordersTab)}
                disabled={ordersBusy || !auth.token}
                className="flex items-center gap-1 font-ibm-mono text-[10px] text-[#888] hover:text-[#ffd600] disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${ordersBusy ? "animate-spin" : ""}`} />{" "}
                {ordersBusy ? "加载中…" : "刷新"}
              </button>
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
              {(
                [
                  { id: "all" as const, label: "全部" },
                  { id: "consume" as const, label: "消费/下单" },
                  { id: "deposit" as const, label: "充值" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setOrdersTab(tab.id)}
                  className={`nb-tab-btn px-4 py-2.5 font-ibm-mono text-xs font-semibold ${
                    ordersTab === tab.id
                      ? "bg-[#ffd600] font-bold text-[#0a0a0a]"
                      : "border border-[#444] text-[#ccc] hover:border-[#ffd600] hover:text-[#ffd600]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {ordersError && (
              <div className="mb-4 border border-[#3a3210] bg-[#171500] p-3 font-ibm-mono text-[11px] text-[#ffd600]">
                {ordersError}
              </div>
            )}

            {!ordersBusy && !ordersError && orders.length === 0 && (
              <div className="border border-dashed border-[#333] bg-[#0a0a0a] p-8 text-center">
                <p className="font-ibm-mono text-sm text-[#888]">暂无订单记录</p>
                <p className="mt-2 font-ibm-mono text-[11px] leading-6 text-[#555]">
                  下单扣款与充值成功后会出现在此列表。
                  完成操作后点「刷新」即可看到。
                </p>
              </div>
            )}

            {orders.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#292929] font-ibm-mono text-[10px] tracking-[1px] text-[#666]">
                      <th className="px-2 py-3 font-normal">时间</th>
                      <th className="px-2 py-3 font-normal">类型</th>
                      <th className="px-2 py-3 font-normal">金额</th>
                      <th
                        className="px-2 py-3 font-normal"
                        title="订单号"
                      >
                        订单号
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((ev) => {
                      const isConsume = ev.type === "Consumed";
                      return (
                        <tr
                          key={`${ev.txHash}-${ev.type}-${ev.orderId || ev.blockNumber}`}
                          className="border-b border-[#1c1c1c] font-ibm-mono text-[11px]"
                        >
                          <td className="px-2 py-3 whitespace-nowrap text-[#aaa]">
                            {formatEventTime(ev.timestamp, ev.blockNumber)}
                          </td>
                          <td className="px-2 py-3">
                            <span
                              className={
                                isConsume
                                  ? "text-[#f87171]"
                                  : "text-[#4ade80]"
                              }
                            >
                              {ev.label}
                            </span>
                          </td>
                          <td className="px-2 py-3 text-[#f5f5f0]">
                            <span className={isConsume ? "text-[#f87171]" : "text-[#4ade80]"}>
                              {isConsume ? "−" : "+"}¥{ev.amountRmb}
                            </span>
                          </td>
                          <td
                            className="px-2 py-3 text-[#888]"
                            title={
                              ev.orderId
                                ? `订单号：${ev.orderId}`
                                : "订单号"
                            }
                          >
                            {ev.orderIdShort || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {orders.length > 0 && (
              <div className="mt-4 font-ibm-mono text-[10px] leading-5 text-[#555]">
                最多展示最近 50 条
              </div>
            )}
          </div>
        )}

        <div className="mt-8 border border-[#292929] p-5 font-ibm-mono text-[11px] leading-6 text-[#777]">
          <div className="mb-2 text-[#f5f5f0]">说明</div>
          <ul className="list-disc space-y-1 pl-5">
            <li>填写充值金额（元），无最低额度（大于 0 即可）。支付宝应付含 3% 手续费；余额充值不退。</li>
            <li>支付宝付款完成后点「我已支付 / 刷新余额」查看到账。</li>
            <li>下方「订单记录」展示充值与消费流水。</li>
            <li>登录账号余额用于下单扣款。</li>
          </ul>
        </div>
      </section>

      {showAuth && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          onClick={() => setShowAuth(false)}
        >
          <div
            className="w-full max-w-md border border-[#444] bg-[#111] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between border-b border-[#292929] pb-4">
              <div>
                <div className="mb-1 font-ibm-mono text-[10px] tracking-[2px] text-[#ffd600]">
                  ACCOUNT
                </div>
                <h2 className="text-xl font-bold">登录 / 注册</h2>
              </div>
              <button onClick={() => setShowAuth(false)} className="text-[#777] hover:text-[#fff]">
                <X />
              </button>
            </div>
            <label className="mb-3 block">
              <span className="mb-2 block font-ibm-mono text-[11px] text-[#aaa]">用户名</span>
              <input
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
                className="w-full border border-[#333] bg-[#0a0a0a] p-3 font-ibm-mono text-xs text-[#f5f5f0] outline-none focus:border-[#ffd600]"
              />
            </label>
            <label className="mb-4 block">
              <span className="mb-2 block font-ibm-mono text-[11px] text-[#aaa]">密码</span>
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full border border-[#333] bg-[#0a0a0a] p-3 font-ibm-mono text-xs text-[#f5f5f0] outline-none focus:border-[#ffd600]"
              />
            </label>
            {authMessage && (
              <div className="mb-4 font-ibm-mono text-[11px] text-[#ffd600]">{authMessage}</div>
            )}
            <div className="flex gap-3">
              <button
                disabled={authBusy}
                onClick={() => void doAuth("login")}
                className="flex-1 bg-[#ffd600] px-4 py-3 text-xs font-bold text-[#0a0a0a] disabled:opacity-60"
              >
                登录
              </button>
              <button
                disabled={authBusy}
                onClick={() => void doAuth("register")}
                className="flex-1 border border-[#ffd600] px-4 py-3 text-xs font-bold text-[#ffd600] disabled:opacity-60"
              >
                注册
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

