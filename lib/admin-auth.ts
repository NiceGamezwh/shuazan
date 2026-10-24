import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "admin_session";
const SESSION_TTL_SEC = 12 * 60 * 60; // 12h

function adminSecret(): string {
  const fromEnv = process.env.ADMIN_SESSION_SECRET?.trim();
  if (fromEnv) return fromEnv;
  const user = process.env.ADMIN_USERNAME?.trim() || "admin";
  const pass = process.env.ADMIN_PASSWORD?.trim() || "dev";
  return createHmac("sha256", "admin-console-v1").update(`${user}:${pass}`).digest("hex");
}

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

export type AdminSession = {
  role: "admin";
  username: string;
  exp: number;
};

export function getAdminCredentials(): { username: string; password: string } | null {
  const username = process.env.ADMIN_USERNAME?.trim() || "";
  const password = process.env.ADMIN_PASSWORD?.trim() || "";
  if (!username || !password) return null;
  return { username, password };
}

function safeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    // still do a compare to reduce timing oracle on length
    const dummy = Buffer.alloc(ab.length);
    timingSafeEqual(ab, dummy);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export function verifyAdminPassword(username: string, password: string): boolean {
  const creds = getAdminCredentials();
  if (!creds) return false;
  return safeEqualStr(username.trim(), creds.username) && safeEqualStr(password, creds.password);
}

export function createAdminSessionToken(username: string): string {
  const payload: AdminSession = {
    role: "admin",
    username: String(username).trim(),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", adminSecret()).update(body).digest();
  return `${body}.${b64url(sig)}`;
}

export function verifyAdminSessionToken(token: string | null | undefined): AdminSession | null {
  if (!token) return null;
  const parts = String(token).trim().split(".");
  if (parts.length !== 2) return null;
  const [body, sigB64] = parts;
  if (!body || !sigB64) return null;
  const expected = createHmac("sha256", adminSecret()).update(body).digest();
  let actual: Buffer;
  try {
    actual = fromB64url(sigB64);
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as AdminSession;
    if (payload?.role !== "admin" || !payload.username || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function readAdminSession(): Promise<AdminSession | null> {
  const jar = await cookies();
  return verifyAdminSessionToken(jar.get(ADMIN_COOKIE)?.value);
}

export function adminCookieOptions(maxAgeSec = SESSION_TTL_SEC) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSec,
  };
}

/** unused helper kept for entropy if needed */
export function randomAdminNonce(): string {
  return randomBytes(16).toString("hex");
}
