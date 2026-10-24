import {
  describeFetchError,
  getCreateOrderHeaders,
  getXysq3Config,
  xysq3Fetch,
} from "@/lib/xysq3";

export type Xysq3UserBalance = {
  username: string;
  /** upstream Balance as number (RMB yuan) */
  balanceYuan: number;
  rawBalance: string;
};

/**
 * Upstream: GET/POST ${XYSQ3_BASE_URL}/api/userInfo
 * Response includes Balance (string yuan). Never forward Pwd/token to clients.
 */
export async function fetchXysq3UserBalance(): Promise<Xysq3UserBalance> {
  const { baseUrl, token } = getXysq3Config();
  if (!token) {
    throw new Error("未配置 XYSQ3_ACCESS_TOKEN，无法读取上游余额");
  }

  let res: Response;
  try {
    res = await xysq3Fetch(`${baseUrl}/api/userInfo`, {
      method: "GET",
      headers: getCreateOrderHeaders(token),
      cache: "no-store",
    });
  } catch (e) {
    throw new Error(`上游余额请求失败：${describeFetchError(e)}`);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`上游余额接口 HTTP ${res.status}：${text.slice(0, 160)}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("上游余额响应不是 JSON");
  }

  if (!data || typeof data !== "object") {
    throw new Error("上游余额响应无效");
  }

  const obj = data as Record<string, unknown>;
  // some errors return { error, msg }
  if (typeof obj.error === "number" && obj.error !== 0) {
    throw new Error(String(obj.msg || obj.message || `上游错误 code=${obj.error}`));
  }

  const raw = obj.Balance ?? obj.balance ?? obj.Money ?? obj.money;
  if (raw == null || raw === "") {
    throw new Error("上游响应中无 Balance 字段");
  }
  const balanceYuan = Number(raw);
  if (!Number.isFinite(balanceYuan)) {
    throw new Error(`无法解析上游余额：${String(raw)}`);
  }

  const username = String(obj.UserName ?? obj.username ?? obj.Phone ?? "").trim();
  return { username, balanceYuan, rawBalance: String(raw) };
}

/** Display multiplier for admin console (upstream × 1.5) */
export const ADMIN_BALANCE_DISPLAY_MULT = 1.5;

export function toAdminDisplayYuan(upstreamYuan: number): number {
  return Math.round(upstreamYuan * ADMIN_BALANCE_DISPLAY_MULT * 100) / 100;
}
