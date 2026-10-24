export type OrderParamInput = {
  name: string;
  key: string;
  value: string;
  type?: number;
};

export type CreateOrderInput = {
  goodsId: number;
  quantity: number;
  params: OrderParamInput[];
};

function formatExpTime(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

function calcCfCount(params: OrderParamInput[]): number {
  const multipliers = params.filter((param) => param.type === 7 || param.type === 8);
  if (multipliers.length === 0) return 1;
  return multipliers.reduce((product, param) => {
    const value = Number(param.value);
    return product * (Number.isFinite(value) && value > 0 ? value : 1);
  }, 1);
}

export function buildCreateOrderBody(input: CreateOrderInput): Record<string, string> {
  const orderParams = [
    input.params.map((param) => ({
      name: param.name,
      alias: param.key,
      value: param.value,
    })),
  ];

  return {
    GoodsIds: String(input.goodsId),
    OrderNum: String(input.quantity),
    OrderParams: JSON.stringify(orderParams),
    CfCount: String(calcCfCount(input.params)),
    ExpTime: formatExpTime(),
    ExeTime: "0",
    ZxType: "1",
  };
}

/** Prefer explicit XYSQ3_* then standard proxy env. HTTP CONNECT (Clash mixed) preferred over SOCKS when both set. */
export function getXysq3Config() {
  const baseUrl = (process.env.XYSQ3_BASE_URL || "https://xysq3.cc").replace(/\/$/, "");
  const token = process.env.XYSQ3_ACCESS_TOKEN?.trim() || "";
  const proxyUrl =
    process.env.XYSQ3_HTTPS_PROXY?.trim() ||
    process.env.HTTPS_PROXY?.trim() ||
    process.env.HTTP_PROXY?.trim() ||
    process.env.XYSQ3_SOCKS_PROXY?.trim() ||
    process.env.ALL_PROXY?.trim() ||
    process.env.SOCKS_PROXY?.trim() ||
    process.env.SOCKS5_PROXY?.trim() ||
    "";
  return { baseUrl, token, proxyUrl };
}

export function getCreateOrderHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    Accept: "application/json, text/plain, */*",
    Origin: "https://xysq3.cc",
    Referer: "https://xysq3.cc/indexPc.html",
  };
}

function isSocksProxy(proxyUrl: string): boolean {
  return /^socks5?h?:\/\//i.test(proxyUrl.trim());
}

function normalizeProxyUrl(proxyUrl: string): string {
  const raw = proxyUrl.trim();
  if (!raw) return raw;
  if (/^(https?|socks5?h?):\/\//i.test(raw)) return raw;
  // bare host:port → assume HTTP proxy (Clash mixed port)
  return `http://${raw}`;
}

type ProxyDispatcher = {
  proxyUrl: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agent: any;
};

let cachedDispatcher: ProxyDispatcher | null = null;

async function getProxyAgent(proxyUrl: string) {
  const normalized = normalizeProxyUrl(proxyUrl);
  if (cachedDispatcher && cachedDispatcher.proxyUrl === normalized) {
    return cachedDispatcher.agent;
  }

  let agent;
  if (isSocksProxy(normalized)) {
    const { SocksProxyAgent } = await import("socks-proxy-agent");
    agent = new SocksProxyAgent(normalized);
  } else {
    const { HttpsProxyAgent } = await import("https-proxy-agent");
    agent = new HttpsProxyAgent(normalized);
  }

  cachedDispatcher = { proxyUrl: normalized, agent };
  return agent;
}

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) out[key] = value;
    return out;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (value == null) continue;
    out[key] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return out;
}

function bodyToBuffer(body: BodyInit | null | undefined): Buffer | undefined {
  if (body == null) return undefined;
  if (typeof body === "string") return Buffer.from(body);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof URLSearchParams) return Buffer.from(body.toString());
  if (typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer) {
    return Buffer.from(body);
  }
  // ReadableStream / FormData / Blob not expected for xysq3 calls
  return Buffer.from(String(body));
}

async function nodeProxyFetch(
  input: string,
  init: RequestInit | undefined,
  proxyUrl: string,
): Promise<Response> {
  const https = await import("node:https");
  const http = await import("node:http");
  const agent = await getProxyAgent(proxyUrl);
  const target = new URL(input);
  const lib = target.protocol === "http:" ? http : https;
  const method = (init?.method || "GET").toUpperCase();
  const headers = headersToRecord(init?.headers);
  const bodyBuf = bodyToBuffer(init?.body ?? undefined);

  if (bodyBuf && !headers["content-length"] && !headers["Content-Length"]) {
    headers["Content-Length"] = String(bodyBuf.length);
  }

  const timeoutMs = 30_000;

  return new Promise<Response>((resolve, reject) => {
    const req = lib.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method,
        headers,
        agent,
        servername: target.hostname,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const responseHeaders = new Headers();
          for (const [key, value] of Object.entries(res.headers)) {
            if (value == null) continue;
            if (Array.isArray(value)) {
              for (const item of value) responseHeaders.append(key, item);
            } else {
              responseHeaders.set(key, value);
            }
          }
          resolve(
            new Response(buf, {
              status: res.statusCode ?? 0,
              statusText: res.statusMessage,
              headers: responseHeaders,
            }),
          );
        });
        res.on("error", reject);
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error(`proxy request timeout after ${timeoutMs}ms`));
    });
    req.on("error", reject);

    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

function isRetryableProxyError(error: unknown): boolean {
  const text = describeFetchError(error);
  return /TLS|ECONNRESET|ECONNREFUSED|socket disconnected|Client network socket|other side closed|ETIMEDOUT|timeout/i.test(
    text,
  );
}

/** Bust agent cache so the next attempt opens a fresh CONNECT tunnel (helps Clash flakiness). */
function resetProxyAgentCache() {
  cachedDispatcher = null;
}

export async function xysq3Fetch(input: string, init?: RequestInit): Promise<Response> {
  const { proxyUrl } = getXysq3Config();

  if (!proxyUrl) {
    return fetch(input, init);
  }

  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await nodeProxyFetch(input, init, proxyUrl);
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts && isRetryableProxyError(error)) {
        resetProxyAgentCache();
        await new Promise((r) => setTimeout(r, 200 * attempt));
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("xysq3 proxy fetch failed");
}

export function describeFetchError(error: unknown): string {
  if (!(error instanceof Error)) return "连接 xysq3 失败";

  const parts = [error.message];
  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause instanceof Error && cause.message) parts.push(cause.message);
  else if (cause && typeof cause === "object" && "code" in cause) {
    parts.push(String((cause as { code?: string }).code));
  }

  const text = parts.filter(Boolean).join(" | ");
  const { proxyUrl } = getXysq3Config();
  if (!proxyUrl && /fetch failed|ECONNREFUSED|ENOTFOUND|Connect|certificate|TLS/i.test(text)) {
    return `${text}。本机直连 xysq3.cc 失败时，请在 .env.local 设置 XYSQ3_HTTPS_PROXY=http://127.0.0.1:7897（Clash 混合口用 http://）或 XYSQ3_SOCKS_PROXY=socks5://127.0.0.1:7897 后重启 Next`;
  }
  return text;
}
