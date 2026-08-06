import assert from "node:assert/strict";
import test from "node:test";
import { createPlanPostsHandler, notionPageToPost } from "./plan-posts.js";

const ORIGIN = "https://fandom.justlikekatie.com";
const env = {
  NOTION_API_KEY: "notion-token",
  NOTION_POSTS_DB_ID: "database-id",
  PLAN_OPERATOR_TOKEN: "operator-token",
};

test("reads the full ScheduledDate value without truncating legacy or datetime values", () => {
  assert.equal(notionPageToPost(page("2026-08-01")).scheduledDate, "2026-08-01");
  assert.equal(
    notionPageToPost(page("2026-08-01T18:30:00-04:00")).scheduledDate,
    "2026-08-01T18:30:00-04:00",
  );
});

test("updates only ScheduledDate and returns the exact persisted instant", async () => {
  const calls = [];
  const handler = createPlanPostsHandler({
    env,
    fetchImpl: async (url, init = {}) => {
      calls.push({ url, init });
      if (url.endsWith("/databases/database-id")) {
        return Response.json(schema());
      }
      if (url.endsWith("/pages/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa") && init.method !== "PATCH") {
        return Response.json(page("2026-08-01", "2026-08-01T10:00:00.000Z"));
      }
      const body = JSON.parse(init.body);
      assert.deepEqual(body, {
        properties: {
          ScheduledDate: { date: { start: "2026-08-01T22:30:00.000Z" } },
        },
      });
      return Response.json(page("2026-08-01T22:30:00.000Z", "2026-08-01T10:01:00.000Z"));
    },
  });
  const response = await handler(mutation({
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    expectedVersion: "2026-08-01T10:00:00.000Z",
    scheduledDate: "2026-08-01T22:30:00.000Z",
  }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.post.scheduledDate, "2026-08-01T22:30:00.000Z");
  assert.equal(body.post.execution.state, "not_recorded");
  assert.equal(calls.length, 3);
});

test("clears a schedule and updates canonical status properties", async () => {
  const patches = [];
  const handler = createPlanPostsHandler({
    env,
    fetchImpl: async (url, init = {}) => {
      if (url.endsWith("/databases/database-id")) return Response.json(schema());
      if (url.endsWith("/pages/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa") && init.method !== "PATCH") {
        return Response.json(page("2026-08-01"));
      }
      patches.push(JSON.parse(init.body));
      return Response.json(page(""));
    },
  });
  const response = await handler(mutation({
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    scheduledDate: null,
    status: "Approved",
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(patches[0], {
    properties: {
      ScheduledDate: { date: null },
      Status: { status: { name: "Approved" } },
    },
  });
});

test("rejects stale mutations before writing", async () => {
  let calls = 0;
  const handler = createPlanPostsHandler({
    env,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? Response.json(schema())
        : Response.json(page("2026-08-01", "2026-08-01T10:01:00.000Z"));
    },
  });
  const response = await handler(mutation({
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    expectedVersion: "2026-08-01T10:00:00.000Z",
    status: "Ready",
  }));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /changed in Notion/);
  assert.equal(calls, 2);
});

test("rejects cross-origin and non-canonical status mutations", async () => {
  const handler = createPlanPostsHandler({ env, fetchImpl: async () => Response.json({}) });
  const crossOrigin = new Request(`${ORIGIN}/api/plan-posts`, {
    method: "PATCH",
    headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
    body: JSON.stringify({ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", status: "Ready" }),
  });
  assert.equal((await handler(crossOrigin)).status, 403);
  assert.equal((await handler(mutation({
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    status: "Queued",
  }))).status, 400);
});

test("requires operator authorization and rejects pages outside the configured database", async () => {
  const handler = createPlanPostsHandler({
    env,
    fetchImpl: async (url) => (
      url.endsWith("/databases/database-id")
        ? Response.json(schema())
        : Response.json({
            ...page("2026-08-01"),
            parent: { type: "database_id", database_id: "another-database" },
          })
    ),
  });
  const unauthorized = new Request(`${ORIGIN}/api/plan-posts`);
  assert.equal((await handler(unauthorized)).status, 401);
  const wrongParent = await handler(mutation({
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    status: "Ready",
  }));
  assert.equal(wrongParent.status, 403);
  assert.match((await wrongParent.json()).error, /configured Posts DB/);
});

test("locks Status and ScheduledDate after operator scheduling is recorded", async () => {
  let notionPatchCalled = false;
  const scheduledAt = "2026-08-08T18:30:00-04:00";
  const handler = createPlanPostsHandler({
    env: { ...env, PLAN_INTEGRATION_TOKEN: "integration-token" },
    fetchImpl: async (url, init = {}) => {
      if (url.endsWith("/databases/database-id")) return Response.json(schema());
      if (url.includes("/api/integrations/plan/operator-scheduled")) {
        return Response.json({
          execution: {
            id: "execution-id",
            notionPageId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            state: "operator_scheduled_receipt_pending",
            scheduledAt,
            notionVersion: "2026-08-01T10:00:00.000Z",
            recordedBy: "operator",
            recordedAt: "2026-08-01T10:05:00.000Z",
          },
        });
      }
      if (init.method === "PATCH") notionPatchCalled = true;
      return Response.json({
        ...page(scheduledAt),
        properties: {
          ...page(scheduledAt).properties,
          Platform: { select: { name: "Rednote" } },
          Status: { status: { name: "Approved" } },
        },
      });
    },
  });

  const response = await handler(mutation({
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    expectedVersion: "2026-08-01T10:00:00.000Z",
    status: "Published",
  }));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /already recorded/);
  assert.equal(notionPatchCalled, false);
});

function mutation(body) {
  return new Request(`${ORIGIN}/api/plan-posts`, {
    method: "PATCH",
    headers: {
      Origin: ORIGIN,
      Authorization: "Bearer operator-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function schema() {
  return {
    properties: {
      ScheduledDate: { type: "date" },
      Status: { type: "status" },
    },
  };
}

function page(scheduledDate, version = "2026-08-01T10:00:00.000Z") {
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    url: "https://notion.so/post",
    last_edited_time: version,
    parent: { type: "database_id", database_id: "database-id" },
    properties: {
      Headline: { title: [{ plain_text: "Tonight post" }] },
      ScheduledDate: { date: scheduledDate ? { start: scheduledDate } : null },
      Status: { status: { name: "Draft" } },
      Thumbnail: { url: "https://cdn.example/post.png" },
      "Weibo text": { rich_text: [{ plain_text: "Ready caption #tag" }] },
      "Publish packet ready": { checkbox: true },
    },
  };
}
