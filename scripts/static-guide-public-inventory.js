import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { posix, resolve } from "node:path";
import { PUBLIC_STATIC_ROUTES } from "../shared/public-routes.js";

const guideDirectories = ["public/c-drama-fandom", "public/c-dramas"];
const vibingDirectory = "public/c-drama-fandom/vibing-now";

// Exact generated query-share files only. Do not derive this list from the
// filesystem or exclude the previews directory. See docs/static-guide-inventory.md.
export const STATIC_GUIDE_QUERY_SHARE_EXCLUSIONS = Object.freeze({
  "public/c-drama-fandom/fandom-games/sect-day/previews/sect-savior/index.html": "Sect day fixed query-share preview",
  "public/c-drama-fandom/fandom-games/sect-day/previews/three-realms/index.html": "Sect day fixed query-share preview",
  "public/c-drama-fandom/fandom-games/sect-day/previews/heavenly-vow/index.html": "Sect day fixed query-share preview",
  "public/c-drama-fandom/fandom-games/sect-day/previews/masters-favorite/index.html": "Sect day fixed query-share preview",
  "public/c-drama-fandom/fandom-games/sect-day/previews/before-lunch/index.html": "Sect day fixed query-share preview",
  "public/c-drama-fandom/fandom-games/sect-day/previews/back-mountain/index.html": "Sect day fixed query-share preview",
  "public/c-drama-fandom/fandom-games/previews/bamboo-recluse/index.html": "LG01 query-share preview",
  "public/c-drama-fandom/fandom-games/previews/celestial-guardian/index.html": "LG01 query-share preview",
  "public/c-drama-fandom/fandom-games/previews/chaos-prince/index.html": "LG01 query-share preview",
  "public/c-drama-fandom/fandom-games/previews/exiled-immortal/index.html": "LG01 query-share preview",
  "public/c-drama-fandom/fandom-games/previews/fated-romantic/index.html": "LG01 query-share preview",
  "public/c-drama-fandom/fandom-games/previews/fox-spirit/index.html": "LG01 query-share preview",
  "public/c-drama-fandom/fandom-games/previews/lotus-healer/index.html": "LG01 query-share preview",
  "public/c-drama-fandom/fandom-games/previews/moonlit-strategist/index.html": "LG01 query-share preview",
  "public/c-drama-fandom/fandom-games/previews/silent-sword/index.html": "LG01 query-share preview",
});

// No non-public fixtures are currently shipped. Any future exception must name
// one file and document its reason in docs/static-guide-inventory.md.
const nonPublicFixtures = Object.freeze({});

export function assertStaticGuidePublicInventory(root, routes = PUBLIC_STATIC_ROUTES, fixtures = nonPublicFixtures) {
  for (const [page, reason] of Object.entries(fixtures)) {
    assert.ok(guideDirectories.some((directory) => page.startsWith(`${directory}/`))
      && page.endsWith("/index.html") && posix.normalize(page) === page
      && !page.startsWith(`${vibingDirectory}/`)
      && typeof reason === "string" && reason.trim(),
    `${page}: a non-public fixture exemption needs an exact guide file path and documented reason`);
  }

  function visit(directory) {
    const entries = readdirSync(resolve(root, directory), { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const page = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        // The separate Vibing Now inventory owns episode-bounded articles.
        if (page !== vibingDirectory) visit(page);
        else checkPage(`${page}/index.html`);
      } else if (entry.isFile() && entry.name === "index.html") {
        checkPage(page);
      }
    }
  }

  function checkPage(page) {
    if (Object.hasOwn(STATIC_GUIDE_QUERY_SHARE_EXCLUSIONS, page) || Object.hasOwn(fixtures, page)) return;
    const expectedRoute = `/${page.replace(/^public\//, "").replace(/index\.html$/, "")}`;
    assert.ok(routes.some(({ path, page: registeredPage }) => (
      registeredPage === page && path === expectedRoute
    )), `${page}: unregistered static C-drama guide; expected route ${expectedRoute} in shared/public-routes.js`);
  }

  for (const directory of guideDirectories) visit(directory);
}