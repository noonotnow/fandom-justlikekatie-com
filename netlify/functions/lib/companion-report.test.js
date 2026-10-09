import test from "node:test";
import assert from "node:assert/strict";
import { createCompanionReport } from "./companion-report.js";

test("admin companion report suppresses small groups and never returns identities", async () => {
  const stores = Object.fromEntries(["companion-interest", "engagement", "companion-pilot-outcomes"]
    .map(name => [name, new Map()]));
  const store = name => ({
    async get(key) { return stores[name].get(key); },
    async *list({ prefix }) {
      const keys = [...stores[name].keys()].filter(key => key.startsWith(prefix));
      yield { blobs: keys.slice(0, 5).map(key => ({ key })) };
      yield { blobs: keys.slice(5).map(key => ({ key })) };
    },
  });
  const report = createCompanionReport({
    getStore: store,
    now: () => new Date("2026-10-01T12:00:00Z"),
    auth: { async authenticateAdmin(req) {
      if (!req.headers.get("x-admin")) throw Object.assign(new Error("Forbidden"), { status: 403 });
    } },
  });
  const interest = stores["companion-interest"];
  const engagement = stores.engagement;
  const outcomes = stores["companion-pilot-outcomes"];
  for (let i = 0; i < 11; i++) {
    interest.set(`changes/2026-09-29/${i}`, { action: "added", path: "discover", timestamp: "2026-09-29T12:00:00Z", email: "private@example.com" });
    interest.set(`subscribers/${i}`, { consent: true, path: "discover", email: "private@example.com" });
    engagement.set(`c-drama-companion-pilot:companion_path_view:${i}`, {
      event: "companion_path_view", pilotPath: "discover", timestamp: "2026-09-29T12:00:00Z",
    });
    engagement.set(`c-drama-companion-pilot:companion_qualified_view:${i}`, {
      event: "companion_qualified_view", pilotPath: "discover", timestamp: "2026-09-29T12:00:00Z",
    });
    outcomes.set(`2026-09-29/${i}`, { event: "first_paid_collector_invoice", timestamp: "2026-09-29T12:00:00Z" });
  }
  for (const [event, prefix] of [
    ["companion_path_view", "c-drama-companion-pilot"],
    ["companion_qualified_view", "c-drama-companion-pilot"],
    ["membership_view", "vibe-atlas-membership"],
    ["checkout_started", "vibe-atlas-membership"],
  ]) {
    for (let i = 0; i < 11; i++) {
      engagement.set(`${prefix}:${event}:internal-${i}`, {
        event, pilotPath: "context", timestamp: "2026-09-29T12:00:00Z",
        internalPilot: true, email: "staff@example.com",
      });
      engagement.set(`${prefix}:${event}:reader-${i}`, {
        event, pilotPath: "discover", timestamp: "2026-09-29T12:00:00Z",
      });
    }
  }
  interest.set("changes/2026-09-29/removed", { action: "removed", path: "discover", timestamp: "2026-09-29T13:00:00Z" });
  interest.set("changes/2026-09-29/rare", { action: "added", path: "context", timestamp: "2026-09-29T13:00:00Z" });
  const url = "https://example.com/.netlify/functions/companion-report?from=2026-09-29&to=2026-09-30";
  assert.equal((await report(new Request(url))).status, 403);
  const response = await report(new Request(url, { headers: { "x-admin": "yes" } }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(body.byPath.discover.added, 11);
  assert.equal(body.byPath.discover.removed, null);
  assert.equal(body.byPath.discover.currentActiveConsents, 11);
  assert.equal(body.byPath.discover.pathEventRequests, 22);
  assert.equal(body.byPath.discover.qualifiedSessionVisits, 22);
  assert.equal(body.byPath.discover.membershipViews, 11);
  assert.equal(body.byPath.discover.checkoutStarts, 11);
  assert.equal(body.byPath.context.qualifiedSessionVisits, null);
  assert.equal(body.byPath.context.pathEventRequests, null);
  assert.equal(body.byPath.context.membershipViews, null);
  assert.equal(body.byPath.context.checkoutStarts, null);
  assert.equal(body.byPath.context.added, null);
  assert.equal(body.firstPaidCollectorInvoices, 11);
  assert.equal(body.qualifiedVisits, null);
  assert.equal(body.pathAttributedPurchases, null);
  assert.equal(JSON.stringify(body).includes("private@example.com"), false);
  assert.equal(JSON.stringify(body).includes("staff@example.com"), false);
  assert.equal((await report(new Request(
    "https://example.com/.netlify/functions/companion-report?from=2026-09-30&to=2026-09-29",
    { headers: { "x-admin": "yes" } },
  ))).status, 400);
});