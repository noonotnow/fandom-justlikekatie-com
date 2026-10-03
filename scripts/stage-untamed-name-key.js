import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { renderUntamedNameKey } from "./untamed-name-key.js";
import { WATCH_JOURNAL_PUBLIC_PAGES } from "./generate-public-pages.js";
import { publicRouteUrl } from "../shared/public-routes.js";

export const NAME_KEY_ROUTE = "/c-drama-fandom/untamed-names-and-performers/";
export const BOARD_LABEL = "Looking for character and actor names? Read the three-character name key →";
export const JOURNAL_LABEL = "Three characters and their performers — pre-watch names only →";
export const STAGING_ROOT = fileURLToPath(new URL("../.cache/untamed-name-key-stage/", import.meta.url));
const root = fileURLToPath(new URL("../", import.meta.url));
const read = path => readFileSync(resolve(root, path), "utf8");

function insertExactlyOnce(html, anchor, addition) {
  if (html.split(anchor).length !== 2) throw new Error(`Staging anchor must occur exactly once: ${anchor}`);
  return html.replace(anchor, `${anchor}${addition}`);
}

export function stageUntamedNameKey(output = STAGING_ROOT) {
  // Deliberately not called by prepare:public or the production build.
  // This overlay tests the proposed destination without activating production.
  const pages = new Map([[`${NAME_KEY_ROUTE}index.html`, renderUntamedNameKey()]]);
  const board = "/c-drama-fandom/untamed-name-board/index.html";
  const boardAddition = `<section class="side-card"><a href="${NAME_KEY_ROUTE}">${BOARD_LABEL}</a></section>`;
  const boardHtml = read(`public${board}`);
  pages.set(board, boardHtml.includes(boardAddition) ? boardHtml : insertExactlyOnce(
    boardHtml, '<aside class="side-rail" aria-label="Continue reading">', boardAddition,
  ));
  for (const path of WATCH_JOURNAL_PUBLIC_PAGES) {
    const html = read(path);
    const addition = `<a href="${NAME_KEY_ROUTE}">${JOURNAL_LABEL}</a>`;
    pages.set(`/${path.replace(/^public\//, "")}`, html.includes(addition) ? html : insertExactlyOnce(
      html, '<a href="/c-drama-fandom/untamed-name-board/">Read the name board →</a>', addition,
    ));
  }
  for (const [path, html] of pages) {
    const target = resolve(output, `.${path}`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, html);
  }
  return pages;
}

export function writePrivateReviewPreview() {
  const html = renderUntamedNameKey()
    .replace('<meta name="robots" content="index,follow">', '<meta name="robots" content="noindex,nofollow">')
    .replace(/^\s*<link rel="canonical"[^>]*>\s*$/m, "")
    .replace('<link rel="stylesheet" href="/c-drama-fandom/styles.css">', () => `<style>${read("public/c-drama-fandom/styles.css")}</style>`)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
    .replace(/href="(\/[^"]*)"/g, (_match, path) => `href="${publicRouteUrl(path)}"`)
    .replace('<main id="main">', '<main id="main"><p class="meta-row" role="status">STAGING AUTHORIZED — NOT RELEASED TO PRODUCTION. Reader copy and labels approved; production publication requires a separate decision.</p>');
  const path = resolve(root, "docs/editorial/untamed-three-character-name-key.html");
  writeFileSync(path, html);
  return path;
}

export function createStagingServer(output = STAGING_ROOT) {
  return createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://stage.invalid").pathname);
    let file = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
    if (!/\.[^/]+$/.test(file)) file += "/index.html";
    const overlay = resolve(output, `.${file}`);
    const original = resolve(root, "public", `.${file}`);
    const publicRoot = resolve(root, "public");
    if (!overlay.startsWith(`${resolve(output)}${sep}`) || !original.startsWith(`${publicRoot}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    const target = existsSync(overlay) ? overlay : original;
    if (!existsSync(target)) {
      response.writeHead(404, { "Content-Type": "text/plain" }).end("Not available in private staging");
      return;
    }
    const contentType = target.endsWith(".html") ? "text/html; charset=utf-8"
      : target.endsWith(".css") ? "text/css" : target.endsWith(".js") ? "text/javascript"
      : target.endsWith(".xml") ? "application/xml" : "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
    response.end(readFileSync(target));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  stageUntamedNameKey();
  writePrivateReviewPreview();
  if (process.argv.includes("--serve")) {
    createStagingServer().listen(3003, "0.0.0.0", () => console.log("Private Untamed staging listening on port 3003"));
  } else {
    console.log("Prepared private Untamed staging overlay; production inputs unchanged.");
  }
}