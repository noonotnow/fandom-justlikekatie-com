#!/usr/bin/env node

import { existsSync, mkdirSync } from "node:fs";
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

export const REQUIRED_PUBLIC_PAGES = [
  "public/c-drama-fandom/index.html",
  "public/c-drama-fandom/getting-started/index.html",
  "public/c-drama-fandom/glossary/index.html",
  "public/c-drama-fandom/fandom-games/index.html",
];

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
  ]);
}

if (process.argv[1] && resolve(process.argv[1]) === scriptFile) {
  await preparePublicPages();
  console.log("Prepared crawlable C-drama fandom pages and LG · 01 assets.");
}