// Tiny server-side image proxy.
//
// Why this exists: the daily grid's images are hotlinked directly from arbitrary
// third-party CDNs (tiktok, instagram, sohu, weibo, ...) that don't send CORS
// headers. That's fine for a plain <img src="..."> tag, but it taints any
// <canvas> that draws those images, so canvas.toBlob()/toDataURL() throws a
// SecurityError — which blocks the share-card export feature entirely.
//
// This function fetches the image server-to-server (no CORS involved between
// two servers) and re-serves the raw bytes with an explicit
// Access-Control-Allow-Origin header, so the browser's canvas is happy to
// treat images loaded through this proxy as same-origin-enough
// (crossOrigin = "anonymous" on the <img> + this header = untainted canvas).
//
// Deliberately dependency-free (native fetch, available in Netlify's Node 18+
// function runtime) and deliberately narrow in scope: this is not a general
// purpose proxy, just enough to unblock canvas export of known-shaped
// thumbnail URLs.

const MAX_BYTES = 8 * 1024 * 1024; // 8MB safety cap — thumbnails should be tiny; bail on anything huge
const FETCH_TIMEOUT_MS = 10000;

const ALLOWED_CONTENT_TYPE_PREFIX = "image/";

export default async (req, context) => {
  if (req.method && req.method !== "GET") {
    return jsonError(405, "Method not allowed");
  }

  const url = new URL(req.url);
  const target = url.searchParams.get("url");

  if (!target) {
    return jsonError(400, "Missing url parameter");
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch (e) {
    return jsonError(400, "Invalid url parameter");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return jsonError(400, "Only http/https URLs are allowed");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const upstream = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Some CDNs (weibo, sohu, etc.) reject requests with no UA / referer,
        // or specifically reject requests that *do* carry a referer from an
        // unrelated origin. Mimic a bare browser fetch with no referer, same
        // as the client's existing referrerPolicy="no-referrer" <img> tags.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
      }
    });

    if (!upstream.ok) {
      return jsonError(upstream.status >= 400 && upstream.status < 600 ? 502 : 502, "Upstream fetch failed (" + upstream.status + ")");
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (contentType && !contentType.toLowerCase().startsWith(ALLOWED_CONTENT_TYPE_PREFIX)) {
      return jsonError(415, "Upstream did not return an image (" + contentType + ")");
    }

    const contentLengthHeader = upstream.headers.get("content-length");
    if (contentLengthHeader && Number(contentLengthHeader) > MAX_BYTES) {
      return jsonError(413, "Image too large");
    }

    const buf = await upstream.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return jsonError(413, "Image too large");
    }

    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType || "application/octet-stream",
        "Access-Control-Allow-Origin": "*",
        // Thumbnails are effectively immutable once ranked for a given day — cache
        // fairly aggressively client-side so re-renders of the export card (or
        // repeated visits) don't keep re-hitting third-party CDNs through us.
        "Cache-Control": "public, max-age=86400, immutable"
      }
    });
  } catch (err) {
    const message = err && err.name === "AbortError" ? "Upstream fetch timed out" : (err && err.message) || "Unknown error";
    return jsonError(502, message);
  } finally {
    clearTimeout(timeout);
  }
};

function jsonError(statusCode, message) {
  return new Response(JSON.stringify({ error: message }), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store"
    }
  });
}
