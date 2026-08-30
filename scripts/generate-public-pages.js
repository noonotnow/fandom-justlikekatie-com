#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptFile = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptFile), "..");
const source = resolve(
  root,
  "attached_assets/Firefly_Gemini_Flash_--ATE._THE._ENTIRE._TABLE.--_No_crumbs,_n_1788112484176.png",
);
const outputDir = resolve(root, "public/assets/c-drama-fandom");
const gamePage = resolve(root, "public/c-drama-fandom/fandom-games/index.html");
const previewDir = resolve(root, "public/c-drama-fandom/fandom-games/previews");
const gameScript = resolve(root, "public/c-drama-fandom/fandom-games/lg01.js");

export const REQUIRED_PUBLIC_PAGES = [
  "public/c-drama-fandom/index.html",
  "public/c-drama-fandom/getting-started/index.html",
  "public/c-drama-fandom/glossary/index.html",
  "public/c-drama-fandom/fandom-games/index.html",
];

function loadLg01Outcomes() {
  const script = readFileSync(gameScript, "utf8");
  const matches = [
    ...script.matchAll(
      /\{\s*id: "([^"]+)",\s*number: "([^"]+)",\s*name: "([^"]+)",\s*cn: "([^"]+)",\s*color: "(#[0-9a-f]+)",\s*description: "([^"]+)",\s*\}/g,
    ),
  ];

  if (matches.length !== 9) {
    throw new Error(`Expected nine LG · 01 outcomes, found ${matches.length}.`);
  }

  return matches.map((match) => ({
    id: match[1],
    number: match[2],
    name: match[3],
    cn: match[4],
    color: match[5],
    description: match[6],
  }));
}

export const LG01_OUTCOMES = loadLg01Outcomes();

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeXml(value) {
  return escapeHtml(value).replaceAll("'", "&apos;");
}

function wrapText(value, maxCharacters) {
  const words = value.split(/\s+/);
  const lines = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > maxCharacters) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function socialCardSvg(outcome) {
  const descriptionLines = wrapText(outcome.description, 59).slice(0, 3);
  const description = descriptionLines
    .map(
      (line, index) =>
        `<text x="100" y="${405 + index * 36}" fill="#dce5e8" font-family="Arial, sans-serif" font-size="27">${escapeXml(line)}</text>`,
    )
    .join("");

  return `
    <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#061321" stop-opacity=".88"/>
          <stop offset=".55" stop-color="#061321" stop-opacity=".72"/>
          <stop offset="1" stop-color="#061321" stop-opacity=".9"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#shade)"/>
      <rect x="58" y="52" width="1084" height="526" rx="8" fill="#061321" fill-opacity=".68" stroke="${escapeXml(outcome.color)}" stroke-width="3"/>
      <text x="100" y="125" fill="${escapeXml(outcome.color)}" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="3">LG · 01 / FATE ${escapeXml(outcome.number)}</text>
      <text x="100" y="205" fill="#f3eee5" font-family="Georgia, serif" font-size="33" letter-spacing="2">YOUR XIANXIA FATE IS</text>
      <text x="100" y="305" fill="#f3eee5" font-family="Georgia, serif" font-size="70" font-weight="700">${escapeXml(outcome.name.toUpperCase())}</text>
      <text x="100" y="355" fill="${escapeXml(outcome.color)}" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="2">YOUR RESULT · NINE FATES, ONE ANSWER</text>
      ${description}
      <text x="100" y="535" fill="#d5ac58" font-family="Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="2">FANDOM VIBES · FANDOM.JUSTLIKEKATIE.COM</text>
      <text x="100" y="560" fill="#91a4b0" font-family="Arial, sans-serif" font-size="18">Don&apos;t pick your favorite. Pick the one that exposes you.</text>
    </svg>
  `;
}

function previewHtml(template, outcome) {
  const title = `Your Xianxia Fate: ${outcome.name} | Fandom Vibes`;
  const description = outcome.description;
  const image = `https://fandom.justlikekatie.com/assets/c-drama-fandom/lg01-${outcome.id}-og.jpg`;
  const openGraphUrl = `https://fandom.justlikekatie.com/c-drama-fandom/fandom-games/?fate=${outcome.id}`;
  const replaceAttribute = (html, pattern, value) =>
    html.replace(pattern, `$1${escapeHtml(value)}$2`);

  let html = template.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  html = replaceAttribute(html, /(<meta name="description" content=")[^"]*(")/i, description);
  html = replaceAttribute(html, /(<meta name="robots" content=")[^"]*(")/i, "noindex,follow,max-image-preview:large");
  html = replaceAttribute(html, /(<meta property="og:title" content=")[^"]*(")/i, title);
  html = replaceAttribute(html, /(<meta property="og:description" content=")[^"]*(")/i, description);
  html = replaceAttribute(html, /(<meta property="og:url" content=")[^"]*(")/i, openGraphUrl);
  html = replaceAttribute(html, /(<meta property="og:image" content=")[^"]*(")/i, image);
  html = replaceAttribute(html, /(<meta name="twitter:title" content=")[^"]*(")/i, title);
  html = replaceAttribute(html, /(<meta name="twitter:description" content=")[^"]*(")/i, description);
  html = replaceAttribute(html, /(<meta name="twitter:image" content=")[^"]*(")/i, image);
  return html;
}

async function prepareOutcomeAssets(template) {
  mkdirSync(previewDir, { recursive: true });
  await Promise.all(
    LG01_OUTCOMES.flatMap((outcome) => {
      const socialPath = resolve(outputDir, `lg01-${outcome.id}-og.jpg`);
      const pageDir = resolve(previewDir, outcome.id);
      mkdirSync(pageDir, { recursive: true });
      const pagePath = resolve(pageDir, "index.html");
      const image = sharp(source)
        .rotate()
        .resize(1200, 630, { fit: "cover", position: "attention" })
        .modulate({ brightness: 0.72, saturation: 0.86 })
        .composite([{ input: Buffer.from(socialCardSvg(outcome)) }])
        .jpeg({ quality: 88, progressive: true })
        .toFile(socialPath);
      writeFileSync(pagePath, previewHtml(template, outcome));
      return [image];
    }),
  );
}

export async function preparePublicPages() {
  if (!existsSync(source)) {
    throw new Error(`LG · 01 master is missing: ${source}`);
  }
  for (const page of REQUIRED_PUBLIC_PAGES) {
    if (!existsSync(resolve(root, page))) {
      throw new Error(`Required public page is missing: ${page}`);
    }
  }

  mkdirSync(outputDir, { recursive: true });
  const template = readFileSync(gamePage, "utf8");

  await Promise.all([
    sharp(source)
      .rotate()
      .resize({ width: 1100, withoutEnlargement: true })
      .webp({ quality: 86 })
      .toFile(resolve(outputDir, "which-xianxia-fate-chose-you-lg01.webp")),
    sharp(source)
      .rotate()
      .resize(1200, 630, {
        fit: "contain",
        background: { r: 5, g: 18, b: 31, alpha: 1 },
      })
      .jpeg({ quality: 88, progressive: true })
      .toFile(resolve(outputDir, "lg01-master-og.jpg")),
    prepareOutcomeAssets(template),
  ]);
}

if (process.argv[1] && resolve(process.argv[1]) === scriptFile) {
  await preparePublicPages();
  console.log("Prepared crawlable C-drama fandom pages and LG · 01 assets.");
}