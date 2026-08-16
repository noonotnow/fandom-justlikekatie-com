import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { sendMagicLinkEmail } from "./resend-email.js";

const MAGIC_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 8 * 1024;
const COOKIE = "__Host-fandom_session";

class PublicError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const ADMIN_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createPublicAuth({
  env = process.env,
  getStore,
  sendEmail = sendMagicLinkEmail,
  now = () => new Date(),
  randomToken = () => randomBytes(32).toString("base64url"),
  fetchImpl = fetch,
}) {
  const adminEmails = [];
  for (const entry of (env.FANDOM_ADMIN_EMAILS || "").split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const normalized = trimmed.toLowerCase();
    if (normalized.length > 254 || !ADMIN_EMAIL_RE.test(normalized)) {
      console.warn(
        `[public-auth] FANDOM_ADMIN_EMAILS entry does not look like an email address and will be ignored: "${trimmed}"`
      );
    } else {
      adminEmails.push(normalized);
    }
  }

  const stores = context => ({
    users: getStore("fandom-auth-users", context),
    magic: getStore("fandom-auth-magic-links", context),
    sessions: getStore("fandom-auth-sessions", context),
    limits: getStore("fandom-auth-rate-limits", context),
  });

  return {
    requestMagicLink: withErrors(async (req, context) => {
      requireMethod(req, "POST");
      validateSameOrigin(req);
      requireConfiguration(env, ["FANDOM_AUTH_ID_SECRET", "FANDOM_PUBLIC_ORIGIN"]);
      const { email, next } = await readJson(req);
      const normalizedEmail = normalizeEmail(email);
      // Only a strict allowlist of destinations is honoured; anything else is ignored.
      const nextView = next === "plan" ? "plan" : null;
      const current = now();
      const { magic, limits } = stores(context);
      const limited = await isRateLimited(limits, req, normalizedEmail, env.FANDOM_AUTH_ID_SECRET, current);
      if (!limited) {
        const token = randomToken();
        const digest = sha256(token);
        const accountId = accountIdFor(normalizedEmail, env.FANDOM_AUTH_ID_SECRET);
        await magic.setJSON(`tokens/${digest}`, {
          schemaVersion: 1,
          accountId,
          email: normalizedEmail,
          status: "issued",
          issuedAt: current.toISOString(),
          expiresAt: new Date(current.getTime() + MAGIC_TTL_MS).toISOString(),
        }, { onlyIfNew: true });
        const origin = new URL(env.FANDOM_PUBLIC_ORIGIN).origin;
        const nextParam = nextView ? `&next=${encodeURIComponent(nextView)}` : "";
        await sendEmail({
          env,
          fetchImpl,
          email: normalizedEmail,
          magicLink: `${origin}/auth/verify#token=${encodeURIComponent(token)}${nextParam}`,
        });
      }
      return json(202, { message: "If that address can receive mail, a sign-in link is on its way." });
    }),

    verifyMagicLink: withErrors(async (req, context) => {
      requireMethod(req, "POST");
      validateSameOrigin(req);
      requireConfiguration(env, ["FANDOM_AUTH_ID_SECRET"]);
      const { token } = await readJson(req);
      if (typeof token !== "string" || token.length < 32 || token.length > 200) {
        throw new PublicError("This sign-in link is invalid or expired.", 401);
      }
      const current = now();
      const { users, magic, sessions } = stores(context);
      const key = `tokens/${sha256(token)}`;
      const entry = await getWithMetadata(magic, key);
      if (
        !entry?.data
        || entry.data.status !== "issued"
        || Date.parse(entry.data.expiresAt) <= current.getTime()
      ) throw new PublicError("This sign-in link is invalid or expired.", 401);
      const claim = randomUUID();
      const consumed = {
        ...entry.data,
        status: "consumed",
        consumedAt: current.toISOString(),
        claim,
      };
      const result = await magic.setJSON(key, consumed, entry.etag ? { onlyIfMatch: entry.etag } : undefined);
      if (result?.modified === false) throw new PublicError("This sign-in link is invalid or expired.", 401);
      const verified = await getWithMetadata(magic, key);
      if (verified?.data?.claim !== claim) throw new PublicError("This sign-in link is invalid or expired.", 401);

      const userKey = `users/${consumed.accountId}`;
      const existing = await users.get(userKey, { type: "json", consistency: "strong" });
      const user = {
        schemaVersion: 1,
        accountId: consumed.accountId,
        email: consumed.email,
        createdAt: existing?.createdAt || current.toISOString(),
        lastLoginAt: current.toISOString(),
      };
      await users.setJSON(userKey, user);
      const sessionToken = randomToken();
      await sessions.setJSON(`sessions/${sha256(sessionToken)}`, {
        schemaVersion: 1,
        sessionId: randomUUID(),
        accountId: user.accountId,
        issuedAt: current.toISOString(),
        expiresAt: new Date(current.getTime() + SESSION_TTL_MS).toISOString(),
        revokedAt: null,
      }, { onlyIfNew: true });
      return json(200, { user: publicUser(user) }, {
        "Set-Cookie": sessionCookie(sessionToken, SESSION_TTL_MS),
      });
    }),

    getSession: withErrors(async (req, context) => {
      requireMethod(req, "GET");
      const auth = await authenticateSession(req, stores(context), now());
      if (!auth) return json(200, { user: null });
      const isAdmin = adminEmails.length > 0 && adminEmails.includes(auth.user.email);
      return json(200, { user: { ...publicUser(auth.user), isAdmin } });
    }),

    logout: withErrors(async (req, context) => {
      requireMethod(req, "POST");
      validateSameOrigin(req);
      const selected = stores(context);
      const auth = await authenticateSession(req, selected, now(), true);
      if (auth) {
        const revoked = { ...auth.session, revokedAt: now().toISOString() };
        await selected.sessions.setJSON(
          auth.key,
          revoked,
          auth.etag ? { onlyIfMatch: auth.etag } : undefined,
        );
      }
      return json(200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
    }),

    authenticate: async (req, context) => {
      const auth = await authenticateSession(req, stores(context), now());
      if (!auth) throw new PublicError("Sign in is required.", 401);
      return auth;
    },
  };
}

async function authenticateSession(req, stores, current, includeExpired = false) {
  const token = parseCookies(req.headers.get("cookie") || "")[COOKIE];
  if (!token) return null;
  const key = `sessions/${sha256(token)}`;
  const entry = await getWithMetadata(stores.sessions, key);
  if (!entry?.data || entry.data.revokedAt) return null;
  if (!includeExpired && Date.parse(entry.data.expiresAt) <= current.getTime()) return null;
  const user = await stores.users.get(`users/${entry.data.accountId}`, {
    type: "json",
    consistency: "strong",
  });
  return user ? { key, session: entry.data, etag: entry.etag, user } : null;
}

async function isRateLimited(store, req, email, secret, current) {
  const windowMs = 15 * 60 * 1000;
  const window = Math.floor(current.getTime() / windowMs);
  const ip = req.headers.get("x-nf-client-connection-ip") || "unknown";
  const emailKey = `email/${hmac(email, secret)}/${window}`;
  const ipKey = `ip/${hmac(ip, secret)}/${window}`;
  const [emailCount, ipCount] = await Promise.all([
    incrementLimit(store, emailKey, current),
    incrementLimit(store, ipKey, current),
  ]);
  return emailCount > 5 || ipCount > 20;
}

async function incrementLimit(store, key, current) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const entry = await getWithMetadata(store, key);
    const next = { count: (entry?.data?.count || 0) + 1, updatedAt: current.toISOString() };
    const result = await store.setJSON(
      key,
      next,
      entry?.etag ? { onlyIfMatch: entry.etag } : { onlyIfNew: true },
    );
    if (result?.modified !== false) return next.count;
  }
  return Number.MAX_SAFE_INTEGER;
}

function withErrors(handler) {
  return async (req, context) => {
    try {
      return await handler(req, context);
    } catch (error) {
      if (error instanceof PublicError) return json(error.status, { error: error.message });
      console.error("[public-auth] request failed", error);
      return json(503, { error: "Sign-in is temporarily unavailable." });
    }
  };
}

async function readJson(req) {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new PublicError("Content-Type must be application/json.");
  }
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new PublicError("Request is too large.", 413);
  try { return JSON.parse(text); } catch { throw new PublicError("Request must be valid JSON."); }
}

function normalizeEmail(value) {
  if (typeof value !== "string") throw new PublicError("Enter a valid email address.");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new PublicError("Enter a valid email address.");
  }
  return email;
}

function accountIdFor(email, secret) {
  return `usr_${hmac(email, secret).slice(0, 32)}`;
}

function hmac(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requireConfiguration(env, keys) {
  if (keys.some(key => !env[key])) throw new Error("Fandom auth is not configured.");
}

function requireMethod(req, method) {
  if (req.method !== method) throw new PublicError("Method not allowed.", 405);
}

function validateSameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin) {
    throw new PublicError("Cross-origin requests are not allowed.", 403);
  }
}

function parseCookies(header) {
  return Object.fromEntries(header.split(";").map(part => {
    const [name, ...value] = part.trim().split("=");
    return [name, value.join("=")];
  }).filter(([name]) => name));
}

function sessionCookie(token, ttlMs) {
  return `${COOKIE}=${token}; Path=/; Max-Age=${Math.floor(ttlMs / 1000)}; HttpOnly; Secure; SameSite=Lax`;
}

function clearSessionCookie() {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function publicUser(user) {
  return { accountId: user.accountId, email: user.email };
}

async function getWithMetadata(store, key) {
  if (typeof store.getWithMetadata === "function") {
    return store.getWithMetadata(key, { type: "json", consistency: "strong" });
  }
  const data = await store.get(key, { type: "json", consistency: "strong" });
  return data ? { data } : null;
}

export function secureEqual(actual, expected) {
  const left = Buffer.from(actual || "");
  const right = Buffer.from(expected || "");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}
