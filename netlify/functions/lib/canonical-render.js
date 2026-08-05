import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import sharp from "sharp";

export const RENDER_CONTRACT = "fandom.idea-packet-output.v1";
export const RENDER_VERSION = 1;
export const RENDER_WIDTH = 1080;
export const RENDER_HEIGHT = 1350;

const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const SOURCE_TIMEOUT_MS = 10_000;

export async function renderCanonicalOutput(
  packet,
  output,
  { requestUrl, fetchSourceImpl = fetchSafeImage } = {},
) {
  const cards = output.kind === "grid"
    ? packet.sourceCards.slice(0, 9)
    : packet.sourceCards.filter(card => card.id === output.sourceId);
  if (cards.length === 0) throw new Error(`Output ${output.id} has no persisted source selection.`);

  const sourceBuffers = [];
  for (const card of cards) {
    const target = validatedProxyTarget(card.imageUrl, requestUrl);
    try {
      sourceBuffers.push(await fetchSourceImpl(target));
    } catch (error) {
      throw new Error(`Could not load persisted source "${card.title || card.id}": ${error.message}`);
    }
  }

  const bytes = output.kind === "grid"
    ? await renderGrid(packet, sourceBuffers)
    : await renderIndividual(packet, sourceBuffers[0]);
  const metadata = await sharp(bytes).metadata();
  if (
    metadata.format !== "png"
    || metadata.width !== RENDER_WIDTH
    || metadata.height !== RENDER_HEIGHT
  ) {
    throw new Error("Canonical renderer produced invalid PNG dimensions.");
  }
  return bytes;
}

export function validatedProxyTarget(value, requestUrl) {
  const proxy = new URL(value, requestUrl);
  const requestOrigin = new URL(requestUrl).origin;
  if (
    proxy.origin !== requestOrigin
    || !["/.netlify/functions/image-proxy", "/api/image-proxy"].includes(proxy.pathname)
  ) {
    throw new Error("Persisted source image must use the same-origin image proxy.");
  }
  const targetValue = proxy.searchParams.get("url");
  if (!targetValue) throw new Error("Persisted source image proxy is missing its target.");
  return validatePublicHttpsUrl(targetValue);
}

async function renderGrid(packet, sources) {
  const gap = 8;
  const left = 56;
  const top = 190;
  const tile = Math.floor((RENDER_WIDTH - left * 2 - gap * 2) / 3);
  const composites = [];
  for (let index = 0; index < sources.length; index += 1) {
    composites.push({
      input: await sharp(sources[index], { failOn: "error" })
        .rotate()
        .resize(tile, tile, { fit: "cover" })
        .png()
        .toBuffer(),
      left: left + (index % 3) * (tile + gap),
      top: top + Math.floor(index / 3) * (tile + gap),
    });
  }
  composites.push({
    input: Buffer.from(gridOverlay(packet)),
    left: 0,
    top: 0,
  });
  return sharp({
    create: {
      width: RENDER_WIDTH,
      height: RENDER_HEIGHT,
      channels: 4,
      background: "#0e0e12",
    },
  }).composite(composites).png().toBuffer();
}

async function renderIndividual(packet, source) {
  const image = await sharp(source, { failOn: "error" })
    .rotate()
    .resize(984, 1030, { fit: "cover" })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: RENDER_WIDTH,
      height: RENDER_HEIGHT,
      channels: 4,
      background: "#0e0e12",
    },
  }).composite([
    { input: image, left: 48, top: 48 },
    { input: Buffer.from(individualOverlay(packet)), left: 0, top: 0 },
  ]).png().toBuffer();
}

function gridOverlay(packet) {
  return `<svg width="${RENDER_WIDTH}" height="${RENDER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <style>
      .gold { fill: #c9a96e; font-family: sans-serif; font-weight: 600; text-anchor: middle; }
      .light { fill: #f0ede8; font-family: sans-serif; font-weight: 700; text-anchor: middle; }
      .muted { fill: #a3a3ad; font-family: sans-serif; text-anchor: middle; }
    </style>
    <text class="gold" x="540" y="72" font-size="28">IDEA PACKET</text>
    <text class="light" x="540" y="132" font-size="44">${escapeXml(`${packet.actor.name} · ${packet.vibe.label}`)}</text>
    <text class="muted" x="540" y="1268" font-size="22">${escapeXml(`${packet.vibe.labelEn} · ${shanghaiDay(packet.provenance.generatedAt)}`)}</text>
    <text class="gold" x="540" y="1310" font-size="18">FANDOM / ${escapeXml(packet.provenance.gridId)}</text>
  </svg>`;
}

function individualOverlay(packet) {
  return `<svg width="${RENDER_WIDTH}" height="${RENDER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect x="48" y="1078" width="984" height="224" fill="#15151b"/>
    <text x="84" y="1148" fill="#c9a96e" font-family="sans-serif" font-size="24" font-weight="600">IDEA PACKET</text>
    <text x="84" y="1210" fill="#f0ede8" font-family="sans-serif" font-size="42" font-weight="700">${escapeXml(`${packet.actor.name} · ${packet.vibe.label}`)}</text>
    <text x="84" y="1260" fill="#a3a3ad" font-family="sans-serif" font-size="22">${escapeXml(`${packet.vibe.labelEn} · ${shanghaiDay(packet.provenance.generatedAt)}`)}</text>
  </svg>`;
}

export async function fetchSafeImage(url, redirectCount = 0) {
  const target = validatePublicHttpsUrl(url);
  const response = await requestPinned(target);
  if (response.status >= 300 && response.status < 400) {
    if (redirectCount >= MAX_REDIRECTS || !response.headers.location) {
      throw new Error("Source image redirect limit exceeded.");
    }
    return fetchSafeImage(new URL(response.headers.location, target).toString(), redirectCount + 1);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Source image returned HTTP ${response.status}.`);
  }
  const contentType = String(response.headers["content-type"] || "").toLowerCase();
  if (!contentType.startsWith("image/")) throw new Error("Source URL did not return an image.");
  return response.body;
}

function requestPinned(url) {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(url, {
      method: "GET",
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent": "FandomCanonicalRenderer/1.0",
      },
      lookup: async (hostname, _options, callback) => {
        try {
          const addresses = await lookup(hostname, { all: true, verbatim: true });
          if (addresses.length === 0 || addresses.some(entry => !isPublicAddress(entry.address))) {
            callback(new Error("Source hostname resolves to a private or invalid address."));
            return;
          }
          callback(null, addresses[0].address, addresses[0].family);
        } catch (error) {
          callback(error);
        }
      },
    }, response => {
      const chunks = [];
      let size = 0;
      response.on("data", chunk => {
        size += chunk.length;
        if (size > MAX_SOURCE_BYTES) {
          req.destroy(new Error("Source image exceeds the byte limit."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({
        status: response.statusCode || 0,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.setTimeout(SOURCE_TIMEOUT_MS, () => req.destroy(new Error("Source image request timed out.")));
    req.on("error", reject);
    req.end();
  });
}

function validatePublicHttpsUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || isIP(url.hostname)
    || url.hostname === "localhost"
    || url.hostname.endsWith(".localhost")
  ) {
    throw new Error("Source image target must be a public HTTPS hostname.");
  }
  return url.toString();
}

function isPublicAddress(address) {
  if (address.includes(":")) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith("::ffff:")) return isPublicAddress(normalized.slice(7));
    return !(
      normalized === "::"
      || normalized === "::1"
      || normalized.startsWith("fc")
      || normalized.startsWith("fd")
      || normalized.startsWith("fe8")
      || normalized.startsWith("fe9")
      || normalized.startsWith("fea")
      || normalized.startsWith("feb")
      || normalized.startsWith("2001:db8:")
    );
  }
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  return !(
    octets[0] === 0
    || octets[0] === 10
    || octets[0] === 127
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 192 && octets[1] === 0 && octets[2] === 0)
    || (octets[0] === 192 && octets[1] === 0 && octets[2] === 2)
    || (octets[0] === 198 && octets[1] >= 18 && octets[1] <= 19)
    || (octets[0] === 198 && octets[1] === 51 && octets[2] === 100)
    || (octets[0] === 203 && octets[1] === 0 && octets[2] === 113)
    || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
    || octets[0] >= 224
  );
}

function shanghaiDay(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
