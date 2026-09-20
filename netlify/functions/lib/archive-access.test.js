import test from "node:test";
import assert from "node:assert/strict";
import {
  ARCHIVE_FREE_EDITION_COUNT,
  archiveAccessDecision,
  freeArchiveDates,
  publicArchiveEdition,
} from "./archive-access.js";
import { createStarOfDayHandler } from "../star-of-day.js";

const editions = [
  "2026-09-20",
  "2026-09-18",
  "2026-09-17",
  "2026-09-12",
  "2026-09-01",
].map(date => ({ date }));

test("the free archive window follows the four latest published editions, not calendar days", () => {
  assert.equal(ARCHIVE_FREE_EDITION_COUNT, 4);
  assert.deepEqual([...freeArchiveDates(editions)], [
    "2026-09-20",
    "2026-09-18",
    "2026-09-17",
    "2026-09-12",
  ]);
});

test("archive policy distinguishes anonymous, free, active, billing-delay, and inactive access", () => {
  const base = { requestedDate: "2026-09-01", editions };
  assert.equal(archiveAccessDecision(base).reason, "sign_in");
  assert.equal(archiveAccessDecision({ ...base, session: { user: {} } }).reason, "upgrade");
  assert.equal(archiveAccessDecision({
    ...base,
    session: { user: {} },
    membership: { status: "active" },
  }).allowed, true);
  for (const status of ["past_due", "incomplete"]) {
    assert.equal(archiveAccessDecision({
      ...base,
      session: { user: {} },
      membership: { status },
    }).reason, "billing_delay");
  }
  for (const status of ["inactive", "cancelled"]) {
    assert.equal(archiveAccessDecision({
      ...base,
      session: { user: {} },
      membership: { status },
    }).reason, "upgrade");
  }
  assert.equal(archiveAccessDecision({
    requestedDate: "2026-09-12",
    editions,
  }).allowed, true);
});

test("locked previews omit full board, provider, and premium media fields", () => {
  const preview = publicArchiveEdition({
    date: "2026-09-01",
    actorName: "Actor",
    vibeLabel: "Vibe",
    displayResults: Array.from({ length: 9 }, (_, index) => ({
      thumbnail: `https://preview.test/${index}.jpg`,
      sourceUrl: `https://raw.test/${index}.jpg`,
      link: `https://provider.test/${index}`,
    })),
    rankedBatches: [{ provider: "private-provider", results: [] }],
    generationPrompt: "private prompt",
  });
  assert.equal(preview.previewThumbnails.length, 3);
  assert.equal("displayResults" in preview, false);
  assert.equal("rankedBatches" in preview, false);
  assert.equal("generationPrompt" in preview, false);
  assert.equal(JSON.stringify(preview).includes("raw.test"), false);
});

function archivePayload(date) {
  return {
    version: "v11",
    date,
    actorId: `actor-${date}`,
    actorName: `Actor ${date}`,
    actorShortNameEn: "Actor",
    vibeEmoji: "✨",
    vibeLabel: "氛围",
    vibeLabelEn: "Vibe",
    vibeSubtitle: "Subtitle",
    vibeSubtitleEn: "Subtitle",
    rankedBatches: [{
      provider: "private-provider",
      results: Array.from({ length: 9 }, (_, index) => ({
        title: `Frame ${index}`,
        thumbnail: `https://preview.test/${date}/${index}.jpg`,
        link: `https://provider.test/${index}`,
        source: "publisher",
      })),
    }],
    displayResults: Array.from({ length: 9 }, (_, index) => ({
      title: `Frame ${index}`,
      thumbnail: `https://preview.test/${date}/${index}.jpg`,
      link: `https://provider.test/${index}`,
      source: "publisher",
    })),
  };
}

function memoryStore(entries) {
  const values = new Map(Object.entries(entries));
  return {
    async get(key, options) {
      const value = values.get(key);
      return options?.type === "json" && value ? structuredClone(value) : value || null;
    },
    async list({ prefix } = {}) {
      return {
        blobs: [...values.keys()]
          .filter(key => !prefix || key.startsWith(prefix))
          .map(key => ({ key })),
      };
    },
    async setJSON(key, value) { values.set(key, structuredClone(value)); },
    async delete(key) { values.delete(key); },
  };
}

function endpointFixture({ authResult = null, membershipStatus = "inactive", env = {} } = {}) {
  const dates = ["2026-09-20", "2026-09-18", "2026-09-17", "2026-09-12", "2026-09-01"];
  const publication = memoryStore(Object.fromEntries(
    dates.map(date => [`starOfDay:v11:${date}`, archivePayload(date)]),
  ));
  const eligibility = memoryStore({});
  const auth = {
    authenticate: async () => {
      if (authResult instanceof Error) throw authResult;
      if (!authResult) {
        const error = new Error("Sign in is required.");
        error.status = 401;
        throw error;
      }
      return authResult;
    },
  };
  const billing = {
    initialize: async () => {},
    repository: () => ({
      membershipForAccount: async () => ({ status: membershipStatus }),
    }),
  };
  return createStarOfDayHandler({
    env,
    auth,
    billing,
    getStore: name => name === "star-of-day" ? publication : eligibility,
    today: () => "2026-09-20",
  });
}

test("historical endpoint keeps free editions public and gates older direct URLs", async () => {
  const handler = endpointFixture();
  const free = await handler(new Request("https://example.test/star-of-day?date=2026-09-12"), {});
  assert.equal(free.status, 200);
  assert.equal(free.headers.get("cache-control"), "public, max-age=300");
  assert.equal((await free.json()).displayResults.length, 9);

  const locked = await handler(new Request("https://example.test/star-of-day?date=2026-09-01"), {});
  assert.equal(locked.status, 401);
  assert.equal(locked.headers.get("cache-control"), "no-store");
  const body = await locked.json();
  assert.equal(body.access, "sign_in");
  assert.equal(body.edition.previewThumbnails.length, 3);
  assert.equal("displayResults" in body, false);
  assert.equal(JSON.stringify(body).includes("private-provider"), false);
});

test("historical endpoint treats stale sessions as signed out and separates active member caches", async () => {
  const stale = new Error("Sign in is required.");
  stale.status = 401;
  const staleResponse = await endpointFixture({ authResult: stale })(
    new Request("https://example.test/star-of-day?date=2026-09-01"),
    {},
  );
  assert.equal(staleResponse.status, 401);
  assert.equal((await staleResponse.json()).access, "sign_in");

  const memberResponse = await endpointFixture({
    authResult: { user: { accountId: "account-1" } },
    membershipStatus: "active",
  })(new Request("https://example.test/star-of-day?date=2026-09-01"), {});
  assert.equal(memberResponse.status, 200);
  assert.equal(memberResponse.headers.get("cache-control"), "private, no-store");
  assert.equal(memberResponse.headers.get("vary"), "Cookie");
  assert.equal(memberResponse.headers.get("x-archive-access"), "active_member");
});

test("historical endpoint returns explicit inactive and temporary billing states", async () => {
  for (const [status, expectedAccess] of [
    ["inactive", "upgrade"],
    ["cancelled", "upgrade"],
    ["past_due", "billing_delay"],
  ]) {
    const response = await endpointFixture({
      authResult: { user: { accountId: "account-1" } },
      membershipStatus: status,
    })(new Request("https://example.test/star-of-day?date=2026-09-01"), {});
    assert.equal(response.status, 403);
    assert.equal((await response.json()).access, expectedAccess);
  }
});

test("archive enforcement can be disabled for controlled rollout validation", async () => {
  const response = await endpointFixture({
    env: { FANDOM_ARCHIVE_GATE_ENABLED: "false" },
  })(new Request("https://example.test/star-of-day?date=2026-09-01"), {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-archive-access"), "free_window");
});