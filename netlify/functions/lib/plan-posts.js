import { enrichPostsWithExecution } from "./plan-execution.js";

const NOTION_API_URL = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const STATUSES = new Set(["Draft", "In progress", "Ready", "Approved", "Published"]);
const mutationLocks = new Map();
const ALIASES = {
  headline: ["Headline", "Name", "Title"],
  series: ["Series", "Content Series"],
  platform: ["Platform", "Platforms"],
  status: ["Status", "Post Status"],
  scheduledDate: ["ScheduledDate", "Scheduled Date", "Schedule Date"],
  imageUrls: ["Image URLs", "Image URL", "Media URLs", "Images"],
  thumbnail: ["Thumbnail", "Cover", "Preview Image"],
  caption: ["Weibo text", "Weibo Text", "Caption", "Caption text"],
  needsMedia: ["Needs media", "Needs Media", "Media needed"],
  needsCaption: ["Needs caption", "Needs Caption", "Caption needed"],
  packetReady: ["Publish packet ready", "Publish Packet Ready", "Packet ready"],
  nextAction: ["Next action", "Next Action"],
  requirements: ["Requirements", "Post requirements"],
  campaignNotes: [
    "Campaign notes / requirements",
    "Campaign Notes / Requirements",
    "Campaign notes",
    "Campaign requirements",
    "Notes",
  ],
  createUrl: ["CREATE URL", "Create URL", "Source Content URL", "Content URL", "Source URL"],
  postUrl: ["Weibo URL", "Post URL", "Published URL"],
};

class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

class UpstreamError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export function createPlanPostsHandler({
  fetchImpl = fetch,
  env = process.env,
} = {}) {
  return async function planPosts(req) {
    try {
      validateSameOrigin(req);
      const config = getConfig(env);
      validateAuthorization(req, config.operatorToken);
      if (req.method === "GET") {
        const id = new URL(req.url).searchParams.get("id");
        if (id) {
          validatePageId(id);
          return jsonResponse(200, {
            post: await getPost(fetchImpl, config, id, env),
          });
        }
        return jsonResponse(200, await listPosts(fetchImpl, config, env));
      }
      if (req.method === "PATCH") {
        const input = await readMutation(req);
        return jsonResponse(200, {
          post: await withPostLock(
            input.id,
            () => updatePost(fetchImpl, config, input, env),
          ),
        });
      }
      return jsonResponse(405, { error: "Method not allowed" }, { Allow: "GET, PATCH" });
    } catch (error) {
      if (error instanceof RequestError || error instanceof UpstreamError) {
        return jsonResponse(error.status, { error: error.message });
      }
      console.error("[plan-posts] unexpected error", error);
      return jsonResponse(500, { error: "Internal server error" });
    }
  };
}

function getConfig(env) {
  const token = env.NOTION_API_KEY;
  const databaseId = env.NOTION_POSTS_DB_ID;
  const operatorToken = env.PLAN_OPERATOR_TOKEN;
  if (!token || !databaseId || !operatorToken) {
    throw new RequestError(
      "PLAN Posts is not configured. Add NOTION_API_KEY, NOTION_POSTS_DB_ID, and PLAN_OPERATOR_TOKEN.",
      503,
    );
  }
  return { token, databaseId, operatorToken };
}

function validateSameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) {
    if (req.method === "GET") return;
    throw new RequestError("Origin header is required", 403);
  }
  if (origin !== new URL(req.url).origin) {
    throw new RequestError("Cross-origin PLAN requests are not allowed", 403);
  }
}

function validateAuthorization(req, expectedToken) {
  const authorization = req.headers.get("authorization") || "";
  const actualToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const actual = Buffer.from(actualToken);
  const expected = Buffer.from(expectedToken);
  if (
    actual.length !== expected.length
    || !timingSafeEqual(actual, expected)
  ) {
    throw new RequestError("PLAN operator authorization is required", 401);
  }
}

async function listPosts(fetchImpl, config, env) {
  const pages = [];
  let cursor;
  do {
    const result = await notionJson(
      fetchImpl,
      `${NOTION_API_URL}/databases/${config.databaseId}/query`,
      config.token,
      {
        method: "POST",
        body: JSON.stringify({
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
      },
    );
    if (!Array.isArray(result.results)) {
      throw new UpstreamError("Notion returned an invalid Posts response");
    }
    pages.push(...result.results);
    cursor = result.has_more && typeof result.next_cursor === "string"
      ? result.next_cursor
      : undefined;
  } while (cursor);

  const posts = pages.filter(isRecord).map(notionPageToPost);
  return {
    posts: await enrichPostsWithExecution(posts, { fetchImpl, env }),
    source: "notion",
  };
}

async function getPost(fetchImpl, config, id, env) {
  const current = await notionJson(
    fetchImpl,
    `${NOTION_API_URL}/pages/${id}`,
    config.token,
  );
  if (!isRecord(current)) throw new UpstreamError("Notion returned an invalid post");
  validatePostParent(current, config.databaseId);
  const [post] = await enrichPostsWithExecution(
    [notionPageToPost(current)],
    { fetchImpl, env },
  );
  return post;
}

async function updatePost(fetchImpl, config, input, env) {
  const schema = await notionJson(
    fetchImpl,
    `${NOTION_API_URL}/databases/${config.databaseId}`,
    config.token,
  );
  const current = await notionJson(
    fetchImpl,
    `${NOTION_API_URL}/pages/${input.id}`,
    config.token,
  );
  if (!isRecord(current)) throw new UpstreamError("Notion returned an invalid post");
  validatePostParent(current, config.databaseId);
  if (input.expectedVersion && current.last_edited_time !== input.expectedVersion) {
    throw new RequestError(
      "This post changed in Notion. Refresh before applying your edit.",
      409,
    );
  }
  const [currentPost] = await enrichPostsWithExecution(
    [notionPageToPost(current)],
    { fetchImpl, env },
  );
  if (currentPost.execution.state === "unavailable") {
    throw new RequestError(
      "XHS execution state is unavailable. Refresh before editing this Rednote post.",
      503,
    );
  }
  if (currentPost.execution.state !== "not_recorded") {
    throw new RequestError(
      "Operator scheduling is already recorded. ScheduledDate and Status are locked.",
      409,
    );
  }

  const properties = {};
  if (Object.hasOwn(input, "scheduledDate")) {
    const match = findProperty(schema.properties, ALIASES.scheduledDate, "date");
    properties[match] = {
      date: input.scheduledDate === null ? null : { start: input.scheduledDate },
    };
  }
  if (Object.hasOwn(input, "status")) {
    const match = findProperty(schema.properties, ALIASES.status, ["status", "select"]);
    const type = schema.properties[match].type;
    properties[match] = type === "status"
      ? { status: { name: input.status } }
      : { select: { name: input.status } };
  }

  const updated = await notionJson(
    fetchImpl,
    `${NOTION_API_URL}/pages/${input.id}`,
    config.token,
    {
      method: "PATCH",
      body: JSON.stringify({ properties }),
    },
  );
  const [post] = await enrichPostsWithExecution(
    [notionPageToPost(updated)],
    { fetchImpl, env },
  );
  return post;
}

async function withPostLock(id, operation) {
  const previous = mutationLocks.get(id) ?? Promise.resolve();
  let release;
  const current = new Promise(resolve => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  mutationLocks.set(id, queued);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (mutationLocks.get(id) === queued) mutationLocks.delete(id);
  }
}

function normalizeId(value) {
  return typeof value === "string" ? value.replaceAll("-", "").toLowerCase() : "";
}

function validatePageId(value) {
  if (
    typeof value !== "string"
    || !/^[0-9a-f-]{32,36}$/i.test(value)
  ) {
    throw new RequestError("A valid Notion page id is required");
  }
}

function validatePostParent(page, databaseId) {
  const parentDatabaseId = page.parent?.type === "database_id"
    ? page.parent.database_id
    : "";
  if (normalizeId(parentDatabaseId) !== normalizeId(databaseId)) {
    throw new RequestError("The selected post does not belong to the configured Posts DB", 403);
  }
}

async function readMutation(req) {
  let value;
  try {
    value = await req.json();
  } catch {
    throw new RequestError("Request body must be valid JSON");
  }
  if (!isRecord(value)) throw new RequestError("Request body must be an object");
  const allowed = new Set(["id", "expectedVersion", "scheduledDate", "status"]);
  const unknown = Object.keys(value).find(key => !allowed.has(key));
  if (unknown) throw new RequestError(`Unknown mutation field: ${unknown}`);
  if (
    typeof value.id !== "string"
    || !/^[0-9a-f-]{32,36}$/i.test(value.id)
  ) {
    throw new RequestError("A valid Notion page id is required");
  }
  if (
    value.expectedVersion !== undefined
    && (
      typeof value.expectedVersion !== "string"
      || Number.isNaN(Date.parse(value.expectedVersion))
    )
  ) {
    throw new RequestError("expectedVersion must be an ISO datetime");
  }
  const hasSchedule = Object.hasOwn(value, "scheduledDate");
  const hasStatus = Object.hasOwn(value, "status");
  if (!hasSchedule && !hasStatus) {
    throw new RequestError("Provide scheduledDate or status");
  }
  if (
    hasSchedule
    && value.scheduledDate !== null
    && (
      typeof value.scheduledDate !== "string"
      || !isScheduledDate(value.scheduledDate)
    )
  ) {
    throw new RequestError("scheduledDate must be null, YYYY-MM-DD, or an ISO datetime");
  }
  if (hasStatus && !STATUSES.has(value.status)) {
    throw new RequestError("status is not a canonical PLAN status");
  }
  return value;
}

function isScheduledDate(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return true;
  return /T\d{2}:\d{2}/.test(value) && !Number.isNaN(Date.parse(value));
}

function findProperty(properties, aliases, expectedTypes) {
  if (!isRecord(properties)) throw new UpstreamError("Notion returned an invalid database schema");
  const types = Array.isArray(expectedTypes) ? expectedTypes : [expectedTypes];
  for (const alias of aliases) {
    const name = Object.keys(properties).find(key => key.toLowerCase() === alias.toLowerCase());
    if (name && types.includes(properties[name]?.type)) return name;
  }
  throw new UpstreamError(
    `Posts DB is missing ${aliases[0]} with type ${types.join(" or ")}`,
    503,
  );
}

export function notionPageToPost(page) {
  const properties = isRecord(page.properties) ? page.properties : {};
  const get = key => property(properties, ALIASES[key]);
  const imageUrls = propertyUrls(get("imageUrls"));
  const thumbnail = propertyUrls(get("thumbnail"))[0];
  const caption = propertyText(get("caption"));
  const needsMedia = propertyBoolean(get("needsMedia"));
  const needsCaption = propertyBoolean(get("needsCaption"));
  const packetReady = propertyBoolean(get("packetReady"));
  const status = propertyText(get("status")) || "Draft";
  const mediaAttached = Boolean(thumbnail || imageUrls[0]);
  const captionWritten = Boolean(caption);
  const published = /^(published|posted)$/i.test(status);
  const mediaBlocked = needsMedia === true || !mediaAttached;
  const captionBlocked = needsCaption === true || !captionWritten;
  const productionStage = published
    ? "Published"
    : mediaBlocked
      ? "Needs Media"
      : captionBlocked
        ? "Needs Caption"
        : packetReady === true
          ? "Ready for XHS Admin"
          : "Review Packet";

  return {
    id: String(page.id ?? ""),
    version: typeof page.last_edited_time === "string" ? page.last_edited_time : "",
    headline: propertyText(get("headline")) || "Untitled post",
    series: propertyText(get("series")),
    platform: propertyText(get("platform")) || "Unspecified",
    status,
    scheduledDate: propertyDate(get("scheduledDate")),
    thumbnail,
    imageUrls,
    imageUrl: thumbnail || imageUrls[0],
    caption,
    needsMedia,
    needsCaption,
    packetReady,
    mediaAttached,
    captionWritten,
    mediaBlocked,
    captionBlocked,
    productionStage,
    nextAction: propertyText(get("nextAction")),
    requirements: propertyText(get("requirements")),
    campaignNotes: propertyText(get("campaignNotes")),
    notionUrl: typeof page.url === "string" ? page.url : undefined,
    createUrl: propertyUrls(get("createUrl"))[0],
    postUrl: propertyUrls(get("postUrl"))[0],
  };
}

function property(properties, aliases) {
  for (const alias of aliases) {
    const name = Object.keys(properties).find(key => key.toLowerCase() === alias.toLowerCase());
    if (name) return properties[name];
  }
  return undefined;
}

function plainText(value) {
  return Array.isArray(value)
    ? value.map(item => item?.plain_text ?? item?.text?.content ?? "").join("").trim()
    : "";
}

function propertyText(value) {
  if (!isRecord(value)) return "";
  if (Array.isArray(value.title)) return plainText(value.title);
  if (Array.isArray(value.rich_text)) return plainText(value.rich_text);
  if (typeof value.url === "string") return value.url.trim();
  if (value.select?.name) return String(value.select.name).trim();
  if (value.status?.name) return String(value.status.name).trim();
  if (Array.isArray(value.multi_select)) {
    return value.multi_select.map(item => item?.name ?? "").filter(Boolean).join(", ");
  }
  return "";
}

function propertyDate(value) {
  return typeof value?.date?.start === "string" ? value.date.start : "";
}

function propertyBoolean(value) {
  if (typeof value?.checkbox === "boolean") return value.checkbox;
  if (typeof value?.formula?.boolean === "boolean") return value.formula.boolean;
  return null;
}

function propertyUrls(value) {
  if (!isRecord(value)) return [];
  const urls = [];
  if (typeof value.url === "string") urls.push(value.url);
  if (Array.isArray(value.files)) {
    for (const file of value.files) {
      const url = file?.external?.url ?? file?.file?.url;
      if (typeof url === "string") urls.push(url);
    }
  }
  const text = propertyText(value);
  if (text) urls.push(...text.split(/[\s,]+/));
  return [...new Set(urls.filter(isHttpUrl))];
}

async function notionJson(fetchImpl, url, token, init = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
  } catch {
    throw new UpstreamError("Notion could not be reached", 503);
  }
  const body = await readBoundedJson(response);
  if (!response.ok) {
    throw new UpstreamError(
      typeof body.message === "string"
        ? body.message
        : `Notion request failed (HTTP ${response.status})`,
      response.status === 409 ? 409 : 502,
    );
  }
  return body;
}

async function readBoundedJson(response) {
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    throw new UpstreamError("Notion response is too large");
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new UpstreamError("Notion returned invalid JSON");
  }
}

function isHttpUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
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
import { timingSafeEqual } from "node:crypto";
