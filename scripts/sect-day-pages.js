import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { ENDINGS, GAME_PATH, GAME_URL } from "../public/c-drama-fandom/fandom-games/sect-day/story.js";
const escape = text => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
export function sectPreviewHtml(template, ending) {
  return template.replace(/<title>[^<]*<\/title>/, `<title>${escape(ending.name)} | First Sect Day</title>`)
    .replace(/(<meta (?:property|name)="(?:og:title|twitter:title)" content=")[^"]*"/g, `$1${escape(ending.name)}"`)
    .replace(/(<meta (?:property|name)="(?:description|og:description|twitter:description)" content=")[^"]*"/g, `$1${escape(ending.description)}"`)
    .replace('content="index,follow,max-image-preview:large"', 'content="noindex,follow"')
    .replace(/(<meta property="og:url" content=")[^"]*"/, `$1${GAME_URL}?ending=${ending.id}"`)
    .replaceAll("sect-day-master-og.jpg", `sect-day-${ending.id}-og.jpg`);
}
function lines(text, limit) {
  const result = []; let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && (line + " " + word).length > limit) { result.push(line); line = word; }
    else line = line ? line + " " + word : word;
  }
  result.push(line); return result;
}
export async function prepareSectPages(root) {
  const base = resolve(root, "public" + GAME_PATH);
  const template = readFileSync(resolve(base, "index.html"), "utf8");
  const assets = resolve(root, "public/assets/c-drama-fandom");
  mkdirSync(assets, { recursive: true });
  for (const ending of [null, ...ENDINGS]) {
    const title = ending?.name || "Can You Survive Your First Day in a Sect?";
    const description = ending?.description || "Five decisions. Six endings. No cultivation skills. Quiet Bell Sect welcomes beginners; its mountain has not read the brochure.";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#061321"/><rect x="40" y="40" width="1120" height="550" fill="none" stroke="#d5ac58" stroke-width="3"/><text x="90" y="108" fill="#d5ac58" font-family="sans-serif" font-size="24">FANDOM VIBES / FIRST SECT DAY${ending ? " / SHARED ENDING" : ""}</text>${lines(title, 32).map((line, i) => `<text x="90" y="${200 + i * 64}" fill="#f3eee5" font-family="serif" font-size="52">${escape(line)}</text>`).join("")}${lines(description, 72).map((line, i) => `<text x="90" y="${390 + i * 36}" fill="#dce5e8" font-family="sans-serif" font-size="25">${escape(line)}</text>`).join("")}<text x="90" y="548" fill="#d5ac58" font-family="sans-serif" font-size="22">An original branching adventure · Play at fandom.justlikekatie.com</text></svg>`;
    await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toFile(resolve(assets, `sect-day-${ending?.id || "master"}-og.jpg`));
    if (ending) {
      const dir = resolve(base, "previews", ending.id); mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, "index.html"), sectPreviewHtml(template, ending));
    }
  }
}
