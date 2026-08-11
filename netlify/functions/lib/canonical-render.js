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
  const grid = output.kind === "grid"
    ? packet.grids?.find(candidate => candidate.id === output.sourceId)
    : null;
  const cards = output.kind === "grid"
    ? grid?.images?.slice(0, 9) || packet.sourceCards.slice(0, 9)
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
    ? await renderGrid(packet, grid, sourceBuffers)
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

async function renderGrid(packet, grid, sources) {
  const gap = 12;
  const top = 394;
  const tile = 252;
  const gridWidth = tile * 3 + gap * 2;
  const left = Math.round((RENDER_WIDTH - gridWidth) / 2);
  const composites = [];
  for (let index = 0; index < 9; index += 1) {
    const source = sources[index];
    const input = source
      ? await sharp(source, { failOn: "error" })
        .rotate()
        .resize(tile, tile, { fit: "cover" })
        .png()
        .toBuffer()
      : Buffer.from(placeholderTile(tile));
    composites.push({
      input,
      left: left + (index % 3) * (tile + gap),
      top: top + Math.floor(index / 3) * (tile + gap),
    });
  }
  composites.push({
    input: Buffer.from(gridOverlay(packet, grid)),
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

function placeholderTile(size) {
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" rx="14" fill="#18181f"/>
    <path d="M${size / 2 - 18} ${size / 2}h36M${size / 2} ${size / 2 - 18}v36" stroke="#4c4c58" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
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

function gridOverlay(packet, savedGrid) {
  const grid = savedGrid || {
    id: packet.provenance.gridId,
    actor: packet.actor.name,
    actorEn: packet.actor.nameEn,
    actorAccentColor: "#c9a96e",
    vibe: packet.vibe.label,
    vibeEn: packet.vibe.labelEn,
    vibeEmoji: packet.vibe.emoji,
    vibeSubtitle: packet.captionSeeds || "",
    searchSpell: packet.provenance.batchKeys?.[0] || "",
    capturedDate: shanghaiDay(packet.provenance.generatedAt),
    edition: {},
    images: packet.sourceCards,
  };
  const accent = safeHex(grid.actorAccentColor, "#c9a96e");
  const sources = Array.from(new Set(
    (grid.images || []).map(image => image.publisher).filter(Boolean),
  )).slice(0, 4).join(" · ");
  const spell = truncate(grid.searchSpell || "", 76);
  const subtitle = truncate(grid.vibeSubtitle || "", 88);
  const edition = grid.edition?.legendary ? "LEGENDARY" : grid.edition?.misprint ? "MISPRINT" : "STAR OF DAY";
  return `<svg width="${RENDER_WIDTH}" height="${RENDER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="glow" cx="50%" cy="18%" r="58%">
        <stop offset="0%" stop-color="${accent}" stop-opacity=".18"/>
        <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <style>
      .gold { fill: #c9a96e; font-family: sans-serif; font-weight: 600; text-anchor: middle; }
      .light { fill: #f0ede8; font-family: sans-serif; font-weight: 700; text-anchor: middle; }
      .muted { fill: #a3a3ad; font-family: sans-serif; text-anchor: middle; }
      .dim { fill: #777782; font-family: sans-serif; text-anchor: middle; }
    </style>
    <rect width="1080" height="1350" fill="url(#glow)"/>
    <text class="gold" x="540" y="64" font-size="24">今日氛围图鉴</text>
    <text class="gold" x="540" y="94" font-size="15" letter-spacing="3">${escapeXml(`${grid.capturedDate} · ${edition}`)}</text>
    <text class="light" x="540" y="154" font-size="44">🔮 今日之星 · 氛围格子</text>
    <text x="540" y="214" fill="${accent}" font-family="sans-serif" font-size="40" font-weight="700" text-anchor="middle">${escapeXml(grid.actor)}</text>
    <text class="light" x="540" y="260" font-size="30">${escapeXml(`${grid.vibeEmoji || ""} ${grid.vibe}`.trim())}</text>
    ${spell ? `<text class="muted" x="540" y="306" font-size="22">⌕ ${escapeXml(spell)}</text>` : ""}
    ${subtitle ? `<text class="dim" x="540" y="346" font-size="20">${escapeXml(subtitle)}</text>` : ""}
    ${sources ? `<text class="dim" x="540" y="1232" font-size="17">来源：${escapeXml(sources)}</text>` : ""}
    <text class="gold" x="540" y="1280" font-size="20">🔮 Vibe Guide · 氛围图鉴 · fandom.justlikekatie.com</text>
    <text class="muted" x="540" y="1314" font-size="16">${escapeXml(`${grid.vibeEn || grid.vibe} · ${grid.capturedDate}`)}</text>
    <text class="dim" x="540" y="1338" font-size="13">FANDOM / ${escapeXml(grid.id)}</text>
  </svg>`;
}

function safeHex(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
}

function truncate(value, max) {
  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
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
      lookup: createPublicLookup(),
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

export function createPublicLookup(lookupImpl = lookup) {
  return async function publicLookup(hostname, options, callback) {
    try {
      const addresses = await lookupImpl(hostname, { all: true, verbatim: true });
      if (
        !Array.isArray(addresses)
        || addresses.length === 0
        || addresses.some(entry => (
          !entry
          || typeof entry.address !== "string"
          || ![4, 6].includes(entry.family)
          || isIP(entry.address) !== entry.family
          || !isPublicAddress(entry.address)
        ))
      ) {
        callback(new Error("Source hostname resolves to a private or invalid address."));
        return;
      }
      if (options?.all) {
        callback(null, addresses);
        return;
      }
      callback(null, addresses[0].address, addresses[0].family);
    } catch (error) {
      callback(error);
    }
  };
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
  const family = isIP(address);
  if (family === 0) return false;
  if (family === 6) {
    const normalized = new URL(`http://[${address}]`).hostname.slice(1, -1);
    if (normalized.startsWith("::ffff:")) {
      const mapped = normalized.slice(7).split(":");
      if (mapped.length !== 2) return false;
      const high = Number.parseInt(mapped[0], 16);
      const low = Number.parseInt(mapped[1], 16);
      return isPublicAddress([
        high >>> 8,
        high & 0xff,
        low >>> 8,
        low & 0xff,
      ].join("."));
    }
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
