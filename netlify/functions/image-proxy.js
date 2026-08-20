import sharp from "sharp";
import { fetchSafeImage } from "./lib/canonical-render.js";

const MAX_BYTES = 8 * 1024 * 1024;

export function createImageProxyHandler({
  fetchImageImpl = fetchSafeImage,
  inspectImageImpl = inspectImage,
} = {}) {
  return async function imageProxy(req) {
    if (req.method && req.method !== "GET") {
      return jsonError(405, "Method not allowed");
    }

    const requestUrl = new URL(req.url);
    const target = requestUrl.searchParams.get("url");
    if (!target) return jsonError(400, "Missing url parameter");

    let parsed;
    try {
      parsed = new URL(target);
    } catch {
      return jsonError(400, "Invalid url parameter");
    }
    if (
      parsed.protocol !== "https:"
      || parsed.username
      || parsed.password
      || !parsed.hostname
    ) {
      return jsonError(400, "Only public HTTPS image URLs are allowed");
    }

    try {
      const bytes = Buffer.from(await fetchImageImpl(parsed.toString()));
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
        return jsonError(bytes.byteLength > MAX_BYTES ? 413 : 415, "Image could not be fetched");
      }
      const contentType = await inspectImageImpl(bytes);
      return new Response(bytes, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "*",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "public, max-age=86400, immutable",
        },
      });
    } catch {
      return jsonError(502, "Image could not be fetched");
    }
  };
}

async function inspectImage(bytes) {
  const metadata = await sharp(bytes, {
    failOn: "error",
    limitInputPixels: 40_000_000,
  }).metadata();
  const contentTypes = {
    avif: "image/avif",
    gif: "image/gif",
    heif: "image/heif",
    jpeg: "image/jpeg",
    png: "image/png",
    svg: "image/svg+xml",
    tiff: "image/tiff",
    webp: "image/webp",
  };
  const contentType = contentTypes[metadata.format];
  if (!contentType) throw new Error("Unsupported image format");
  return contentType;
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export default createImageProxyHandler();