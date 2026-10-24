import { createHmac, timingSafeEqual } from "crypto";

const SESSION_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

function sessionSecret(): string {
  const fromEnv = process.env.AUTH_SESSION_SECRET?.trim();
  if (fromEnv) return fromEnv;
  // Fallback: derive from operator key presence (not ideal; set AUTH_SESSION_SECRET in prod)
  const op = process.env.LEDGER_OPERATOR_PRIVATE_KEY?.trim() || "dev-session";
  return createHmac("sha256", "platform-ledger-auth").update(op).digest("hex");
}

export type SessionPayload = {
  username: string;
  exp: number;
};

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

export function createSessionToken(username: string): string {
  const payload: SessionPayload = {
    username: String(username).trim(),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", sessionSecret()).update(body).digest();
  return `${body}.${b64url(sig)}`;
}

export function verifySessionToken(token: string | null | undefined): SessionPayload | null {
  if (!token) return null;
  const raw = String(token).trim();
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [body, sigB64] = parts;
  if (!body || !sigB64) return null;
  const expected = createHmac("sha256", sessionSecret()).update(body).digest();
  let actual: Buffer;
  try {
    actual = fromB64url(sigB64);
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as SessionPayload;
    if (!payload?.username || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { username: String(payload.username).trim(), exp: payload.exp };
  } catch {
    return null;
  }
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}
