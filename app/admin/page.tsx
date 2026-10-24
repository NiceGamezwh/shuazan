"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LogOut, RefreshCw, Shield, Wallet, ExternalLink } from "lucide-react";

const RECHARGE_URL = "https://www.xichen22.com/s/yrZMk4z132u";

export default function AdminPage() {
  const [booting, setBooting] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [username, setUsername] = useState("");
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [message, setMessage] = useState("");

  const [displayYuan, setDisplayYuan] = useState<string | null>(null);
  const [balBusy, setBalBusy] = useState(false);
  const [balError, setBalError] = useState("");

  const qrSrc = useMemo(
    () =>
      `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(RECHARGE_URL)}`,
    [],
  );

  const loadMe = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/me", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data?.ok) {
        setAuthed(true);
        setUsername(String(data.username || ""));
        return true;
      }
      setAuthed(false);
      return false;
    } catch {
      setAuthed(false);
      return false;
    }
  }, []);

  const loadBalance = useCallback(async () => {
    setBalBusy(true);
    setBalError("");
    try {
      const res = await fetch("/api/admin/balance", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setDisplayYuan(null);
        setBalError(String(data?.error || "读取余额失败"));
        return;
      }
      setDisplayYuan(String(data.displayYuanStr ?? data.displayYuan ?? "—"));
    } catch (e) {
      setDisplayYuan(null);
      setBalError(e instanceof Error ? e.message : "网络异常");
    } finally {
      setBalBusy(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const ok = await loadMe();
      setBooting(false);
      if (ok) void loadBalance();
    })();
  }, [loadMe, loadBalance]);

  const doLogin = async () => {
    if (loginBusy) return;
    setLoginBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUser, password: loginPass }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setMessage(String(data?.error || "登录失败"));
        return;
      }
      setLoginPass("");
      setAuthed(true);
      setUsername(String(data.username || loginUser));
      setMessage("登录成功");
      void loadBalance();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "网络异常");
    } finally {
      setLoginBusy(false);
    }
  };

  const doLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthed(false);
    setUsername("");
    setDisplayYuan(null);
    setMessage("已退出");
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#f5f5f0] font-grotesk">
      <header className="sticky top-0 z-20 border-b border-[#292929] bg-[#0a0a0a]/95 backdrop-blur">
        <div className="mx-auto flex h-[64px] max-w-[720px] items-center justify-between px-5">
          <Link
            href="/"
            className="flex items-center gap-2 font-ibm-mono text-[11px] tracking-[1.5px] text-[#888] transition hover:text-[#ffd600]"
          >
            <ArrowLeft className="h-4 w-4" /> 返回
          </Link>
          <div className="flex items-center gap-2 font-ibm-mono text-[10px] tracking-[2px] text-[#666]">
            <Shield className="h-3.5 w-3.5 text-[#ffd600]" /> ADMIN
          </div>
          {authed && (
            <button
              type="button"
              onClick={() => void doLogout()}
              className="flex items-center gap-1 border border-[#3a3a3a] px-3 py-2 font-ibm-mono text-[11px] hover:border-[#ffd600]"
            >
              <LogOut className="h-3.5 w-3.5" /> 退出
            </button>
          )}
          {!authed && <div className="w-16" />}
        </div>
      </header>

      <section className="mx-auto max-w-[720px] px-5 py-10">
        <h1 className="text-3xl font-bold tracking-[-1px]">
          管理后台<span className="text-[#ffd600]">.</span>
        </h1>

        {booting ? (
          <div className="mt-10 font-ibm-mono text-sm text-[#888]">加载中…</div>
        ) : !authed ? (
          <div className="mt-10 border border-[#292929] bg-[#101010] p-6">
            <div className="mb-4 font-ibm-mono text-[10px] tracking-[2px] text-[#666]">
              ADMIN LOGIN
            </div>
            <label className="mb-3 block">
              <span className="mb-2 block font-ibm-mono text-[11px] text-[#aaa]">账号</span>
              <input
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                autoComplete="username"
                className="w-full border border-[#333] bg-[#0a0a0a] p-3 font-ibm-mono text-sm text-[#f5f5f0] outline-none focus:border-[#ffd600]"
              />
            </label>
            <label className="mb-5 block">
              <span className="mb-2 block font-ibm-mono text-[11px] text-[#aaa]">密码</span>
              <input
                type="password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                autoComplete="current-password"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void doLogin();
                }}
                className="w-full border border-[#333] bg-[#0a0a0a] p-3 font-ibm-mono text-sm text-[#f5f5f0] outline-none focus:border-[#ffd600]"
              />
            </label>
            <button
              type="button"
              disabled={loginBusy}
              onClick={() => void doLogin()}
              className={`w-full px-4 py-3.5 text-sm font-bold text-[#0a0a0a] ${
                loginBusy ? "bg-[#9a8f3a]" : "bg-[#ffd600]"
              }`}
            >
              {loginBusy ? "登录中…" : "登录"}
            </button>
            {message && (
              <div className="mt-4 font-ibm-mono text-[11px] text-[#ffd600]">{message}</div>
            )}
          </div>
        ) : (
          <>
            <div className="mt-8 border border-[#292929] bg-[#101010] p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="font-ibm-mono text-[10px] tracking-[2px] text-[#666]">
                    AVAILABLE BALANCE
                  </div>
                  <div className="mt-1 font-ibm-mono text-[11px] text-[#888]">
                    管理员 {username}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void loadBalance()}
                  disabled={balBusy}
                  className="flex items-center gap-1 font-ibm-mono text-[10px] text-[#888] hover:text-[#ffd600] disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${balBusy ? "animate-spin" : ""}`} />{" "}
                  刷新
                </button>
              </div>
              <div className="mb-1 font-ibm-mono text-[11px] text-[#888]">可用余额</div>
              <div className="text-4xl font-bold text-[#ffd600]">
                {balBusy && displayYuan == null ? "…" : displayYuan != null ? `¥${displayYuan}` : "—"}
              </div>
              {balError && (
                <div className="mt-4 border border-[#3a3210] bg-[#171500] p-3 font-ibm-mono text-[11px] text-[#ffd600]">
                  {balError}
                </div>
              )}
            </div>

            <div className="mt-5 border border-[#292929] bg-[#101010] p-6">
              <div className="mb-2 flex items-center gap-2">
                <Wallet className="h-4 w-4 text-[#ffd600]" />
                <div className="font-ibm-mono text-[10px] tracking-[2px] text-[#666]">
                  RECHARGE
                </div>
              </div>
              <h2 className="mb-4 text-lg font-bold">充值</h2>
              <p className="mb-5 font-ibm-mono text-[11px] leading-6 text-[#888]">
                支付页填写管理员账号，金额≥5。
              </p>

              <div className="flex flex-col items-center gap-4">
                <div className="border border-[#333] bg-white p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrSrc}
                    alt="充值二维码"
                    width={220}
                    height={220}
                    className="block h-[220px] w-[220px]"
                  />
                </div>
                <a
                  href={RECHARGE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 font-ibm-mono text-sm text-[#ffd600] underline-offset-4 hover:underline"
                >
                  <ExternalLink className="h-4 w-4" /> 打开充值链接
                </a>
                <div className="break-all text-center font-ibm-mono text-[10px] text-[#555]">
                  {RECHARGE_URL}
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
