const BAIDU_IMAGE_URL = "https://image.baidu.com/search/index";
const DEFAULT_TIMEOUT_MS = 4500;
const DEFAULT_RETRIES = 1;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;

const BROWSER_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
  "Cache-Control": "no-cache",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

const resultCache = new Map();

export class BaiduImageSearchError extends Error {
  constructor(message, { code = "baidu_error", status = null } = {}) {
    super(message);
    this.name = "BaiduImageSearchError";
    this.code = code;
    this.status = status;
  }
}

export function clearBaiduImageCache() {
  resultCache.clear();
}

export function buildBaiduImageUrl(query) {
  const url = new URL(BAIDU_IMAGE_URL);
  url.searchParams.set("tn", "baiduimage");
  url.searchParams.set("ie", "utf-8");
  url.searchParams.set("word", query);
  return url.toString();
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function cleanText(value) {
  if (typeof value !== "string") return "";
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function validHttpUrl(value) {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function hostname(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function canonicalHostname(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const candidate = value.includes("://") ? value : `https://${value}`;
  return hostname(candidate).toLowerCase();
}

function firstUrl(...values) {
  for (const value of values) {
    const url = validHttpUrl(value);
    if (url) return url;
  }
  return "";
}

function replacementUrl(item, key) {
  if (!Array.isArray(item?.replaceUrl)) return "";
  for (const replacement of item.replaceUrl) {
    const value = replacement?.[key] ?? replacement?.[key.toLowerCase()];
    if (typeof value === "string" && value) return value;
  }
  return "";
}

function looksLikeImageItem(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value.thumbURL || value.middleURL || value.hoverURL || value.objURL || value.replaceUrl),
  );
}

export function normalizeBaiduImage(item) {
  if (!looksLikeImageItem(item)) return null;

  const thumbnail = firstUrl(item.thumbURL, item.middleURL, item.hoverURL);
  const original = firstUrl(
    item.objURL,
    item.downloadUrl,
    replacementUrl(item, "ObjURL"),
    item.middleURL,
    thumbnail,
  );
  const link = firstUrl(
    item.fromURL,
    item.sourceUrl,
    item.pageUrl,
    replacementUrl(item, "FromURL"),
    original,
  );
  if (!thumbnail || !link) return null;

  const title =
    cleanText(item.fromPageTitleEnc) ||
    cleanText(item.fromPageTitle) ||
    cleanText(item.title) ||
    cleanText(item.desc);
  const source =
    canonicalHostname(item.fromURLHost) ||
    hostname(link).toLowerCase() ||
    canonicalHostname(item.source) ||
    "Baidu Images";
  const width = Number(item.width ?? item.sourceWidth ?? item.sourcewidth) || undefined;
  const height = Number(item.height ?? item.sourceHeight ?? item.sourceheight) || undefined;

  return {
    title,
    thumbnail,
    thumbnailOriginal: original,
    link,
    source,
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
  };
}

function extractBalancedJson(text, start) {
  const opening = text[start];
  const closing = opening === "{" ? "}" : opening === "[" ? "]" : "";
  if (!closing) return "";

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === opening) {
      depth += 1;
    } else if (char === closing) {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return "";
}

function parseJsonAt(text, start) {
  const json = extractBalancedJson(text, start);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function assignmentRoots(script) {
  const roots = [];
  const assignmentPattern =
    /(?:var\s+imgData|(?:window\.)?(?:__INITIAL_STATE__|__INITIAL_DATA__|__PRELOADED_STATE__))\s*=\s*/g;
  for (const match of script.matchAll(assignmentPattern)) {
    const valueStart = script.slice(match.index + match[0].length).search(/[\[{]/);
    if (valueStart < 0) continue;
    const parsed = parseJsonAt(script, match.index + match[0].length + valueStart);
    if (parsed) roots.push(parsed);
  }
  return roots;
}

function markedObjectRoots(script) {
  const starts = new Set();
  const stack = [];
  let inString = false;
  let escaped = false;

  for (let index = 0; index < script.length; index += 1) {
    const char = script[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      if (
        script.startsWith('"thumbURL"', index) ||
        script.startsWith('"middleURL"', index) ||
        script.startsWith('"hoverURL"', index)
      ) {
        const objectStart = [...stack].reverse().find((entry) => script[entry] === "{");
        if (objectStart !== undefined) starts.add(objectStart);
      }
      inString = true;
    } else if (char === "{" || char === "[") {
      stack.push(index);
    } else if (char === "}" || char === "]") {
      stack.pop();
    }
  }

  return [...starts].map((start) => parseJsonAt(script, start)).filter(Boolean);
}

function collectImageItems(root, output, seen, depth = 0) {
  if (!root || typeof root !== "object" || seen.has(root) || depth > 10) return;
  seen.add(root);

  if (Array.isArray(root)) {
    for (const value of root) {
      if (looksLikeImageItem(value)) output.push(value);
      else collectImageItems(value, output, seen, depth + 1);
    }
    return;
  }

  if (looksLikeImageItem(root)) output.push(root);
  for (const value of Object.values(root)) {
    collectImageItems(value, output, seen, depth + 1);
  }
}

export function parseBaiduImages(payload) {
  if (typeof payload !== "string" || !payload.trim()) {
    throw new BaiduImageSearchError("Baidu returned an empty response", {
      code: "empty_response",
    });
  }
  if (/百度安全验证|请输入验证码|访问过于频繁/.test(payload)) {
    throw new BaiduImageSearchError("Baidu returned an anti-bot verification page", {
      code: "blocked_response",
    });
  }

  const roots = [];
  const trimmed = payload.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      roots.push(JSON.parse(trimmed));
    } catch {
      // Some HTML responses begin with a script object; script extraction below handles them.
    }
  }

  const scripts = [...payload.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(
    (match) => match[1],
  );
  for (const script of scripts.length > 0 ? scripts : [payload]) {
    roots.push(...assignmentRoots(script));
    roots.push(...markedObjectRoots(script));
  }

  const rawItems = [];
  const seen = new WeakSet();
  roots.forEach((root) => collectImageItems(root, rawItems, seen));

  const normalized = [];
  const seenThumbnails = new Set();
  for (const item of rawItems) {
    const result = normalizeBaiduImage(item);
    if (!result || seenThumbnails.has(result.thumbnail)) continue;
    seenThumbnails.add(result.thumbnail);
    normalized.push(result);
  }

  if (normalized.length === 0) {
    throw new BaiduImageSearchError("Baidu response contained no parseable image results", {
      code: "parse_error",
    });
  }
  return { results: normalized, rawCandidateCount: rawItems.length, rootCount: roots.length };
}

function cachedResult(query, now) {
  const entry = resultCache.get(query);
  if (!entry) return null;
  if (now - entry.createdAt >= CACHE_TTL_MS) {
    resultCache.delete(query);
    return null;
  }
  return entry.value;
}

function storeResult(query, value, now) {
  resultCache.set(query, { createdAt: now, value });
  if (resultCache.size > MAX_CACHE_ENTRIES) {
    resultCache.delete(resultCache.keys().next().value);
  }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function cancelResponseBody(response, reason) {
  if (!response?.body?.cancel) return;
  try {
    await response.body.cancel(reason);
  } catch {
    // The body may already be closed or errored; the original provider error remains primary.
  }
}

async function awaitWithAbort(promise, signal, timeoutMs) {
  if (signal.aborted) {
    throw new BaiduImageSearchError(`Baidu request timed out after ${timeoutMs}ms`, {
      code: "timeout",
    });
  }

  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () =>
      reject(
        new BaiduImageSearchError(`Baidu request timed out after ${timeoutMs}ms`, {
          code: "timeout",
        }),
      );
    signal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    return await Promise.race([promise, aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

async function readLimitedBody(response, signal, timeoutMs) {
  if (!response.body?.getReader) {
    const body = await awaitWithAbort(response.text(), signal, timeoutMs);
    if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
      throw new BaiduImageSearchError("Baidu response exceeded the maximum allowed size", {
        code: "response_too_large",
        status: response.status,
      });
    }
    return body;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await awaitWithAbort(reader.read(), signal, timeoutMs);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel("response too large");
        throw new BaiduImageSearchError("Baidu response exceeded the maximum allowed size", {
          code: "response_too_large",
          status: response.status,
        });
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    if (error?.code === "timeout") {
      await reader.cancel("request timed out").catch(() => {});
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, bytes).toString("utf8");
}

export async function searchBaiduImages(
  query,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    cache = true,
    now = Date.now,
    delay = sleep,
  } = {},
) {
  if (!query?.trim()) {
    throw new BaiduImageSearchError("Missing query parameter", { code: "missing_query" });
  }
  if (typeof fetchImpl !== "function") {
    throw new BaiduImageSearchError("Fetch is unavailable", { code: "fetch_unavailable" });
  }

  const normalizedQuery = query.trim();
  const currentTime = now();
  const cached = cache ? cachedResult(normalizedQuery, currentTime) : null;
  if (cached) {
    return {
      results: cached.results.map((result) => ({ ...result })),
      telemetry: { ...cached.telemetry, cacheHit: true },
    };
  }

  const url = buildBaiduImageUrl(normalizedQuery);
  let response;
  let activeController;
  let activeTimer;
  let attempts = 0;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    attempts = attempt + 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await awaitWithAbort(
        fetchImpl(url, {
          method: "GET",
          headers: BROWSER_HEADERS,
          redirect: "follow",
          signal: controller.signal,
        }),
        controller.signal,
        timeoutMs,
      );
    } catch (error) {
      clearTimeout(timer);
      if (error?.code === "timeout") throw error;
      throw new BaiduImageSearchError(error?.message || "Baidu request failed", {
        code: "network_error",
      });
    }

    if ([429, 503].includes(response.status) && attempt < retries) {
      clearTimeout(timer);
      await response.body?.cancel?.().catch(() => {});
      await delay(250 * 2 ** attempt);
      continue;
    }
    activeController = controller;
    activeTimer = timer;
    break;
  }

  let contentType;
  let body;
  try {
    if (!response?.ok) {
      await cancelResponseBody(response, "HTTP error");
      throw new BaiduImageSearchError(`Baidu returned HTTP ${response?.status ?? "unknown"}`, {
        code: "http_error",
        status: response?.status ?? null,
      });
    }

    contentType = response.headers?.get?.("content-type") || "";
    if (
      contentType &&
      !/text\/html|application\/xhtml\+xml|application\/json|text\/plain/i.test(contentType)
    ) {
      await cancelResponseBody(response, "invalid content type");
      throw new BaiduImageSearchError(`Unexpected Baidu content type: ${contentType}`, {
        code: "invalid_content_type",
        status: response.status,
      });
    }
    const contentLength = Number(response.headers?.get?.("content-length")) || 0;
    if (contentLength > MAX_RESPONSE_BYTES) {
      await cancelResponseBody(response, "response too large");
      throw new BaiduImageSearchError("Baidu response exceeded the maximum allowed size", {
        code: "response_too_large",
        status: response.status,
      });
    }
    body = await readLimitedBody(response, activeController.signal, timeoutMs);
  } finally {
    clearTimeout(activeTimer);
  }

  const parsed = parseBaiduImages(body);
  const value = {
    results: parsed.results,
    telemetry: {
      url,
      httpStatus: response.status,
      contentType: contentType || null,
      responseBytes: Buffer.byteLength(body, "utf8"),
      attempts,
      rawCandidateCount: parsed.rawCandidateCount,
      parserRootCount: parsed.rootCount,
      cacheHit: false,
    },
  };
  if (cache) storeResult(normalizedQuery, value, currentTime);
  return {
    results: value.results.map((result) => ({ ...result })),
    telemetry: { ...value.telemetry },
  };
}
