import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  fetchImageBuffer,
  fingerprintImage,
  isNearDuplicate,
  selectDisplayResults,
} from "./image-dedup.js";

test("default thumbnail loading rejects non-public destinations before fetching", async () => {
  await assert.rejects(
    fetchImageBuffer("http://127.0.0.1/internal-preview.jpg"),
    /https|public|address/i,
  );
});

function sceneSvg({ pose = "left", color = "#6b2336", marker = 0 } = {}) {
  const subject = pose === "left"
    ? '<ellipse cx="220" cy="150" rx="58" ry="72" fill="#e8b89b"/><path d="M155 420 Q165 220 220 225 Q290 240 320 420Z" fill="' + color + '"/><path d="M185 255 L95 365" stroke="' + color + '" stroke-width="42"/>'
    : '<ellipse cx="410" cy="145" rx="52" ry="70" fill="#e8b89b"/><path d="M335 420 Q350 220 410 220 Q475 235 505 420Z" fill="' + color + '"/><path d="M440 250 L565 320" stroke="' + color + '" stroke-width="42"/>';
  return Buffer.from(`
    <svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="bg"><stop stop-color="#d8c6b2"/><stop offset="1" stop-color="#6f7f76"/></linearGradient></defs>
      <rect width="640" height="480" fill="url(#bg)"/>
      <rect x="45" y="45" width="550" height="390" rx="20" fill="none" stroke="#f5e9dc" stroke-width="10"/>
      ${subject}
      <circle cx="${80 + marker * 21}" cy="80" r="12" fill="#d5ad48"/>
    </svg>
  `);
}

async function renderedScene(options = {}) {
  return sharp(sceneSvg(options)).jpeg({ quality: 94 }).toBuffer();
}

function result(id) {
  return {
    title: `Result ${id}`,
    thumbnail: `https://images.test/${id}.jpg`,
    link: `https://source.test/${id}`,
    source: "source.test",
  };
}

test("collapses exact image bytes served from different thumbnail URLs", async () => {
  const image = await renderedScene();
  const selected = await selectDisplayResults(
    [{ query: "actor", results: [result("a"), result("b")] }],
    { loadBuffer: async () => image },
  );
  assert.deepEqual(selected.map((item) => item.thumbnail), [result("a").thumbnail]);
});

test("matches a low-resolution blurred recompression to its high-resolution photo", async () => {
  const high = await renderedScene();
  const low = await sharp(high)
    .resize(150, 113)
    .blur(1.2)
    .jpeg({ quality: 35 })
    .toBuffer();

  assert.equal(
    isNearDuplicate(await fingerprintImage(high), await fingerprintImage(low)),
    true,
  );
});

test("retains a distinct editorial pose with the same set, outfit, and palette", async () => {
  const leftPose = await renderedScene({ pose: "left" });
  const rightPose = await renderedScene({ pose: "right" });

  assert.equal(
    isNearDuplicate(await fingerprintImage(leftPose), await fingerprintImage(rightPose)),
    false,
  );
});

test("flags a multi-panel contact sheet instead of rewarding its seam density as quality", async () => {
  const collage = await sharp(Buffer.from(`
    <svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="240" fill="#121820"/>
      <rect x="320" width="320" height="240" fill="#e8e3dc"/>
      <rect y="240" width="320" height="240" fill="#7f2530"/>
      <rect x="320" y="240" width="320" height="240" fill="#216e83"/>
      <rect x="315" width="10" height="480" fill="#fff"/>
      <rect y="235" width="640" height="10" fill="#fff"/>
    </svg>
  `)).jpeg({ quality: 94 }).toBuffer();

  const fingerprint = await fingerprintImage(collage);
  assert.ok(fingerprint.compositeScore >= 0.68);
  assert.ok(fingerprint.singleFrameRatio < 0.55);
  assert.ok(fingerprint.seamCount >= 2);
});

test("keeps the higher-quality candidate when a blurrier copy ranked first", async () => {
  const high = await renderedScene();
  const low = await sharp(high).resize(140, 105).blur(1.5).jpeg({ quality: 30 }).toBuffer();
  const buffers = new Map([
    [result("low").thumbnail, low],
    [result("high").thumbnail, high],
  ]);

  const selected = await selectDisplayResults(
    [{ query: "actor", results: [result("low"), result("high")] }],
    { loadBuffer: async (url) => buffers.get(url) },
  );
  assert.deepEqual(selected.map((item) => item.thumbnail), [result("high").thumbnail]);
});

test("backfills the 3x3 after removing a duplicate before slicing", async () => {
  const duplicate = await renderedScene();
  const candidates = [
    result("dup-low"),
    result("dup-high"),
    ...Array.from({ length: 7 }, (_, index) => result(`unique-${index}`)),
    result("backfill"),
  ];
  const buffers = new Map();
  buffers.set(candidates[0].thumbnail, await sharp(duplicate).resize(140, 105).jpeg({ quality: 30 }).toBuffer());
  buffers.set(candidates[1].thumbnail, duplicate);
  for (let index = 1; index < candidates.length; index += 1) {
    if (!buffers.has(candidates[index].thumbnail)) {
      // A host that cannot be decoded must fail open rather than cost the grid a slot.
      buffers.set(candidates[index].thumbnail, Buffer.from(`unavailable-${index}`));
    }
  }

  const selected = await selectDisplayResults(
    [{ query: "actor", results: candidates }],
    { limit: 9, loadBuffer: async (url) => buffers.get(url) },
  );

  assert.equal(selected.length, 9);
  assert.equal(selected.some((item) => item.thumbnail === result("dup-low").thumbnail), false);
  assert.equal(selected.some((item) => item.thumbnail === result("dup-high").thumbnail), true);
  assert.equal(selected.some((item) => item.thumbnail === result("backfill").thumbnail), true);
});
