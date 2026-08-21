import { randomUUID } from "node:crypto";
import { secureEqual } from "./public-auth.js";

const DEFAULT_XHS_BASE_URL = "https://xhs.justlikekatie.com";
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_LOOKUPS = 40;
const LOOKUP_CONCURRENCY = 5;
const MAX_RESPONSE_BYTES = 256 * 1024;
const EXECUTION_PATH = "/api/integrations/plan/operator-scheduled";
const EXECUTION_STATES = new Set([
  "operator_scheduled_receipt_pending",
  "reconciled",
]);

class RequestError extends Error {
  constructor(message, status = 400, code = "PLAN_EXECUTION_INVALID_REQUEST") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

class UpstreamError extends Error {
  constructor(message, status = 503, code = "PLAN_EXECUTION_UNAVAILABLE") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function createPlanExecutionHandler({
  fetchImpl = fetch,
  env = process.env,
  randomUUIDImpl = randomUUID,
} = {}) {
  return async function planExecution(req) {
    try {
      validateSameOrigin(req);
      const config = getConfig(env, { requireIntegration: true });
      validateAuthorization(req, config.operatorToken);

      if (req.method === "GET") {
        const notionPageId = validateNotionPageId(new URL(req.url).searchParams.get("notionPageId"));
        const result = await fetchExecution(fetchImpl, config, { id: notionPageId });
        if (result.state === "not_recorded") {
          return jsonResponse(404, {
            code: "PLAN_EXECUTION_NOT_FOUND",
            message: "No operator scheduling record exists for this post.",
          });
        }
        if (result.state === "unavailable") {
          return jsonResponse(503, {
            code: "PLAN_EXECUTION_UNAVAILABLE",
            message: result.warning,
          });
        }
        return jsonResponse(200, { execution: result });
      }

      if (req.method === "POST") {
        const input = await readMarker(req);
        const idempotencyKey = readIdempotencyKey(req, randomUUIDImpl);
        const upstream = await requestXhs(fetchImpl, config, EXECUTION_PATH, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(input),
        });
        return jsonResponse(upstream.status, upstream.body, {
          "Idempotency-Key": idempotencyKey,
        });
      }

      return jsonResponse(405, {
        code: "PLAN_EXECUTION_METHOD_NOT_ALLOWED",
        message: "Method not allowed",
      }, { Allow: "GET, POST" });
    } catch (error) {
      if (error instanceof RequestError || error instanceof UpstreamError) {
        return jsonResponse(error.status, { code: error.code, message: error.message });
      }
      console.error("[plan-operator-scheduled] unexpected error", error);
      return jsonResponse(500, {
        code: "PLAN_EXECUTION_INTERNAL_ERROR",
        message: "Internal server error",
      });
    }
  };
}

export async function enrichPostsWithExecution(
  posts,
  { fetchImpl = fetch, env = process.env } = {},
) {
  const relevant = posts.filter(isRednotePost);
  if (relevant.length === 0) {
    return posts.map(post => attachExecution(post, { state: "not_recorded" }));
  }

  let config;
  try {
    config = getConfig(env, { requireIntegration: true });
  } catch (error) {
    const warning = error instanceof Error
      ? error.message
      : "XHS execution state is unavailable.";
    return posts.map(post => attachExecution(
      post,
      isRednotePost(post) ? { state: "unavailable", warning } : { state: "not_recorded" },
    ));
  }

  const selected = relevant.slice(0, MAX_LOOKUPS);
  const results = new Map();
  const deadlineAt = Date.now() + config.timeoutMs;
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(LOOKUP_CONCURRENCY, selected.length) },
    async () => {
      while (cursor < selected.length) {
        if (Date.now() >= deadlineAt) return;
        const post = selected[cursor];
        cursor += 1;
        results.set(post.id, await fetchExecution(fetchImpl, config, {
          id: post.id,
          scheduledAt: post.scheduledDate,
        }, deadlineAt));
      }
    },
  );
  await Promise.all(workers);

  for (const post of selected) {
    if (!results.has(post.id)) {
      results.set(post.id, {
        state: "unavailable",
        warning: `XHS execution refresh exceeded the ${config.timeoutMs}ms lookup deadline.`,
      });
    }
  }

  for (const post of relevant.slice(MAX_LOOKUPS)) {
    results.set(post.id, {
      state: "unavailable",
      warning: `Execution state was not checked because PLAN limits refreshes to ${MAX_LOOKUPS} Rednote posts.`,
    });
  }

  return posts.map(post => attachExecution(
    post,
    results.get(post.id) ?? { state: "not_recorded" },
  ));
}

function attachExecution(post, execution) {
  let productionStage = post.productionStage;
  if (post.productionStage === "Published" || execution.state === "reconciled") {
    productionStage = "Published";
  } else if (execution.state === "operator_scheduled_receipt_pending") {
    productionStage = "Receipt Pending";
  } else if (
    execution.state === "unavailable"
    && post.productionStage === "Ready for XHS Admin"
  ) {
    productionStage = "State Unavailable";
  }
  return { ...post, execution, productionStage };
}

async function fetchExecution(fetchImpl, config, expectation, deadlineAt) {
  try {
    const timeoutMs = deadlineAt
      ? Math.max(1, Math.min(config.timeoutMs, deadlineAt - Date.now()))
      : config.timeoutMs;
    const upstream = await requestXhs(
      fetchImpl,
      config,
      `${EXECUTION_PATH}?notionPageId=${encodeURIComponent(expectation.id)}`,
      {},
      timeoutMs,
    );
    if (
      upstream.status === 404
      && upstream.body?.code === "PLAN_EXECUTION_NOT_FOUND"
    ) {
      return { state: "not_recorded" };
    }
    if (upstream.status < 200 || upstream.status >= 300) {
      return {
        state: "unavailable",
        warning: upstreamMessage(upstream.body, upstream.status),
      };
    }
    return validateExecution(upstream.body?.execution, expectation);
  } catch (error) {
    return {
      state: "unavailable",
      warning: error instanceof Error
        ? error.message
        : "XHS execution state could not be loaded.",
    };
  }
}

function validateExecution(value, expectation) {
  if (
    !isRecord(value)
    || typeof value.id !== "string"
    || !value.id
    || value.notionPageId !== expectation.id
    || !EXECUTION_STATES.has(value.state)
    || !isTimezoneBearingInstant(value.scheduledAt)
    || !isDateTime(value.notionVersion)
    || typeof value.recordedBy !== "string"
    || !value.recordedBy
    || !isDateTime(value.recordedAt)
    || (
      value.reconciledAt !== undefined
      && !isDateTime(value.reconciledAt)
    )
    || (
      expectation.scheduledAt
      && value.scheduledAt !== expectation.scheduledAt
    )
  ) {
    throw new UpstreamError("XHS returned an invalid execution response.");
  }
  return value;
}

async function requestXhs(
  fetchImpl,
  config,
  path,
  init = {},
  timeoutMs = config.timeoutMs,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${config.baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.integrationToken}`,
        ...init.headers,
      },
    });
    return { status: response.status, body: await readBoundedJson(response) };
  } catch (error) {
    const message = error?.name === "AbortError"
      ? `XHS execution request timed out after ${timeoutMs}ms.`
      : "XHS execution service could not be reached.";
    throw new UpstreamError(message);
  } finally {
    clearTimeout(timeout);
  }
}

function getConfig(env, { requireIntegration }) {
  const operatorToken = env.PLAN_OPERATOR_TOKEN;
  const integrationToken = env.PLAN_INTEGRATION_TOKEN;
  if (!operatorToken) {
    throw new RequestError(
      "PLAN operator authorization is not configured.",
      503,
      "PLAN_OPERATOR_NOT_CONFIGURED",
    );
  }
  if (requireIntegration && !integrationToken) {
    throw new UpstreamError(
      "XHS execution integration is not configured. Add PLAN_INTEGRATION_TOKEN.",
    );
  }

  let baseUrl;
  try {
    const parsed = new URL(env.PLAN_XHS_BASE_URL || DEFAULT_XHS_BASE_URL);
    if (parsed.protocol !== "https:") throw new Error();
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    parsed.search = "";
    parsed.hash = "";
    baseUrl = parsed.toString().replace(/\/$/, "");
  } catch {
    throw new UpstreamError("PLAN_XHS_BASE_URL must be a valid HTTPS origin.");
  }

  const timeoutMs = env.PLAN_XHS_TIMEOUT_MS === undefined
    ? DEFAULT_TIMEOUT_MS
    : Number(env.PLAN_XHS_TIMEOUT_MS);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 15_000) {
    throw new UpstreamError("PLAN_XHS_TIMEOUT_MS must be between 500 and 15000.");
  }
  return { operatorToken, integrationToken, baseUrl, timeoutMs };
}

function validateSameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) {
    if (req.method === "GET") return;
    throw new RequestError(
      "Origin header is required",
      403,
      "PLAN_EXECUTION_ORIGIN_REQUIRED",
    );
  }
  if (origin !== new URL(req.url).origin) {
    throw new RequestError(
      "Cross-origin PLAN requests are not allowed",
      403,
      "PLAN_EXECUTION_CROSS_ORIGIN",
    );
  }
}

function validateAuthorization(req, expectedToken) {
  const authorization = req.headers.get("authorization") || "";
  const actualToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!secureEqual(actualToken, expectedToken)) {
    throw new RequestError(
      "PLAN operator authorization is required",
      401,
      "PLAN_OPERATOR_UNAUTHORIZED",
    );
  }
}

async function readMarker(req) {
  let value;
  try {
    value = await req.json();
  } catch {
    throw new RequestError("Request body must be valid JSON");
  }
  if (!isRecord(value)) throw new RequestError("Request body must be an object");
  const allowed = new Set([
    "notionPageId",
    "expectedNotionVersion",
    "expectedScheduledAt",
  ]);
  const unknown = Object.keys(value).find(key => !allowed.has(key));
  if (unknown) throw new RequestError(`Unknown marker field: ${unknown}`);
  validateNotionPageId(value.notionPageId);
  if (!isDateTime(value.expectedNotionVersion)) {
    throw new RequestError("expectedNotionVersion must be an ISO datetime");
  }
  if (!isTimezoneBearingInstant(value.expectedScheduledAt)) {
    throw new RequestError(
      "expectedScheduledAt must be a timezone-bearing ISO instant",
    );
  }
  return {
    notionPageId: value.notionPageId,
    expectedNotionVersion: value.expectedNotionVersion,
    expectedScheduledAt: value.expectedScheduledAt,
  };
}

function validateNotionPageId(value) {
  if (
    typeof value !== "string"
    || !/^[0-9a-f]{32}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new RequestError("A valid Notion page id is required");
  }
  return value;
}

function readIdempotencyKey(req, randomUUIDImpl) {
  const value = req.headers.get("idempotency-key") || randomUUIDImpl();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new RequestError("Idempotency-Key must be a UUID");
  }
  return value;
}

function isRednotePost(post) {
  return /^(rednote|both)$/i.test(post.platform);
}

function isDateTime(value) {
  return typeof value === "string"
    && /T\d{2}:\d{2}/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function isTimezoneBearingInstant(value) {
  return isDateTime(value)
    && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
}

function upstreamMessage(body, status) {
  if (typeof body?.message === "string" && body.message) return body.message;
  return `XHS execution request failed (HTTP ${status}).`;
}

async function readBoundedJson(response) {
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    throw new UpstreamError("XHS execution response is too large.");
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new UpstreamError("XHS execution service returned invalid JSON.");
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}
