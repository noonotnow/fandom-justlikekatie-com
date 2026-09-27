import { createHmac } from "node:crypto";

export const PILOT_PATHS = new Set(["discover", "context", "collect"]);

export function createCompanionInterest({ getStore, env = process.env, now = () => new Date() }) {
  return async (req, context) => {
    if (req.method !== "POST") return reply(405, { error: "Method not allowed." });
    const origin = req.headers.get("origin");
    if (!origin || origin !== new URL(req.url).origin) return reply(403, { error: "Invalid origin." });
    if (!env.FANDOM_AUTH_ID_SECRET) return reply(503, { error: "Interest signup is unavailable." });
    let data;
    try {
      if (Number(req.headers.get("content-length") || 0) > 2048) throw new Error();
      const text = await req.text();
      if (text.length > 2048) throw new Error();
      data = JSON.parse(text);
    } catch { return reply(400, { error: "Invalid request." }); }
    const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply(400, { error: "Enter a valid email address." });
    }
    if (data.action !== "subscribe" && data.action !== "unsubscribe") {
      return reply(400, { error: "Invalid action." });
    }
    if (data.action === "subscribe" && (data.consent !== true || !PILOT_PATHS.has(data.path))) {
      return reply(400, { error: "Choose a path and agree to the email consent." });
    }
    const key = createHmac("sha256", env.FANDOM_AUTH_ID_SECRET).update(email).digest("hex");
    try {
      const store = getStore("companion-interest", context);
      if (data.action === "unsubscribe") {
        await store.delete(`subscribers/${key}`);
      } else {
        await store.setJSON(`subscribers/${key}`, {
          schemaVersion: 1, email, path: data.path, consent: true,
          consentText: "Email me about this C-drama companion pilot. I can unsubscribe at any time.",
          consentedAt: now().toISOString(), source: "public-guide",
        });
        // This is a consented research-interest list, not an account or sign-in request.
        // No marketing mail is sent by this endpoint.
      }
      return reply(200, { message: data.action === "subscribe"
        ? "Thanks. Your interest has been recorded. No emails are scheduled yet."
        : "If that address was on the list, it has been removed." });
    } catch {
      return reply(503, { error: "Could not save your choice. Please try again later." });
    }
  };
}

function reply(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}