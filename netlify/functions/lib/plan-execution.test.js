import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createPlanExecutionHandler,
  enrichPostsWithExecution,
} from "./plan-execution.js";

const ORIGIN = "https://fandom.justlikekatie.com";
const NOTION_PAGE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const IDEMPOTENCY_KEY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const env = {
  PLAN_OPERATOR_TOKEN: "operator-token",
  PLAN_INTEGRATION_TOKEN: "integration-secret",
};

test("forwards the exact operator marker contract without exposing the integration secret", async () => {
  const calls = [];
  const handler = createPlanExecutionHandler({
    env,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return Response.json({
        execution: execution("operator_scheduled_receipt_pending"),
      }, { status: 201 });
    },
  });

  const response = await handler(markerRequest());
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("idempotency-key"), IDEMPOTENCY_KEY);
  assert.equal(calls[0].url, "https://xhs.justlikekatie.com/api/integrations/plan/operator-scheduled");
  assert.equal(calls[0].init.headers.Authorization, "Bearer integration-secret");
  assert.equal(calls[0].init.headers["Idempotency-Key"], IDEMPOTENCY_KEY);
  assert.deepEqual(JSON.parse(calls[0].init.body), markerBody());

  const clientSource = readFileSync(
    new URL("../../../src/utils/planPosts.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(clientSource, /PLAN_INTEGRATION_TOKEN|integration-secret/);
});

test("preserves replay and named conflict responses from XHS", async () => {
  for (const status of [200, 201]) {
    const handler = createPlanExecutionHandler({
      env,
      fetchImpl: async () => Response.json({
        execution: execution("operator_scheduled_receipt_pending"),
      }, { status }),
    });
    const response = await handler(markerRequest());
    assert.equal(response.status, status);
    assert.equal((await response.json()).execution.state, "operator_scheduled_receipt_pending");
  }

  const conflict = createPlanExecutionHandler({
    env,
    fetchImpl: async () => Response.json({
      code: "PLAN_EXECUTION_SCHEDULE_MISMATCH",
      message: "ScheduledDate changed.",
    }, { status: 409 }),
  });
  const response = await conflict(markerRequest());
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    code: "PLAN_EXECUTION_SCHEDULE_MISMATCH",
    message: "ScheduledDate changed.",
  });
});

test("fails clearly for missing configuration, upstream outages, invalid schedules, and cross-origin requests", async () => {
  const missing = createPlanExecutionHandler({
    env: { PLAN_OPERATOR_TOKEN: "operator-token" },
  });
  const missingResponse = await missing(markerRequest());
  assert.equal(missingResponse.status, 503);
  assert.equal((await missingResponse.json()).code, "PLAN_EXECUTION_UNAVAILABLE");

  const unavailable = createPlanExecutionHandler({
    env,
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });
  const unavailableResponse = await unavailable(markerRequest());
  assert.equal(unavailableResponse.status, 503);
  assert.equal((await unavailableResponse.json()).code, "PLAN_EXECUTION_UNAVAILABLE");

  const dateOnly = await unavailable(markerRequest({
    expectedScheduledAt: "2026-08-08",
  }));
  assert.equal(dateOnly.status, 400);
  assert.match((await dateOnly.json()).message, /timezone-bearing/);

  const crossOrigin = await unavailable(markerRequest({}, "https://evil.example"));
  assert.equal(crossOrigin.status, 403);

  const unauthorized = await unavailable(new Request(
    `${ORIGIN}/api/plan-operator-scheduled?notionPageId=${NOTION_PAGE_ID}`,
  ));
  assert.equal(unauthorized.status, 401);
});

test("enriches Rednote posts fail closed and keeps handled posts out of the dispatch lane", async () => {
  const posts = [
    planPost("not-recorded"),
    planPost("pending"),
    planPost("reconciled"),
    planPost("unavailable"),
    { ...planPost("weibo"), platform: "Weibo" },
  ];
  const enriched = await enrichPostsWithExecution(posts, {
    env,
    fetchImpl: async url => {
      const id = new URL(url).searchParams.get("notionPageId");
      if (id === "not-recorded") {
        return Response.json({
          code: "PLAN_EXECUTION_NOT_FOUND",
          message: "Not found",
        }, { status: 404 });
      }
      if (id === "pending") {
        return Response.json({
          execution: execution("operator_scheduled_receipt_pending", id),
        });
      }
      if (id === "reconciled") {
        return Response.json({ execution: execution("reconciled", id) });
      }
      throw new Error("offline");
    },
  });

  assert.equal(enriched[0].execution.state, "not_recorded");
  assert.equal(enriched[0].productionStage, "Ready for XHS Admin");
  assert.equal(enriched[1].productionStage, "Receipt Pending");
  assert.equal(enriched[2].productionStage, "Published");
  assert.equal(enriched[3].execution.state, "unavailable");
  assert.equal(enriched[3].productionStage, "State Unavailable");
  assert.equal(enriched[4].execution.state, "not_recorded");
});

test("keeps the timeout active through response bodies and bounds the aggregate lookup deadline", async () => {
  const slowEnv = { ...env, PLAN_XHS_TIMEOUT_MS: "500" };
  const hangingFetch = async (_url, init) => new Response(new ReadableStream({
    start(controller) {
      init.signal.addEventListener("abort", () => {
        controller.error(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    },
  }));

  const handler = createPlanExecutionHandler({
    env: slowEnv,
    fetchImpl: hangingFetch,
  });
  const started = Date.now();
  const response = await handler(markerRequest());
  assert.equal(response.status, 503);
  assert.match((await response.json()).message, /timed out/);
  assert.ok(Date.now() - started < 900);

  const manyPosts = Array.from({ length: 12 }, (_, index) => planPost(`post-${index}`));
  const aggregateStarted = Date.now();
  const enriched = await enrichPostsWithExecution(manyPosts, {
    env: slowEnv,
    fetchImpl: hangingFetch,
  });
  assert.ok(Date.now() - aggregateStarted < 900);
  assert.ok(enriched.every(post => post.execution.state === "unavailable"));
});

function markerRequest(overrides = {}, origin = ORIGIN) {
  return new Request(`${ORIGIN}/api/plan-operator-scheduled`, {
    method: "POST",
    headers: {
      Origin: origin,
      Authorization: "Bearer operator-token",
      "Content-Type": "application/json",
      "Idempotency-Key": IDEMPOTENCY_KEY,
    },
    body: JSON.stringify({ ...markerBody(), ...overrides }),
  });
}

function markerBody() {
  return {
    notionPageId: NOTION_PAGE_ID,
    expectedNotionVersion: "2026-08-06T18:00:00.000Z",
    expectedScheduledAt: "2026-08-08T18:30:00-04:00",
  };
}

function execution(state, notionPageId = NOTION_PAGE_ID) {
  return {
    id: "execution-id",
    notionPageId,
    state,
    scheduledAt: "2026-08-08T18:30:00-04:00",
    notionVersion: "2026-08-06T18:00:00.000Z",
    recordedBy: "operator",
    recordedAt: "2026-08-06T19:00:00.000Z",
  };
}

function planPost(id) {
  return {
    id,
    platform: "Rednote",
    status: "Approved",
    productionStage: "Ready for XHS Admin",
  };
}
