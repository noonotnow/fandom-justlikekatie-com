import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { posix, resolve } from "node:path";
import { PUBLIC_STATIC_ROUTES } from "../shared/public-routes.js";

const shelfDirectory = "public/c-drama-fandom/vibing-now";

// Exact file paths only, with a reason also recorded in
// docs/vibing-now-publication-review.md. There are currently no exceptions.
const nonPublicFixtures = Object.freeze({});

export function assertVibingPublicInventory(root, routes = PUBLIC_STATIC_ROUTES, fixtures = nonPublicFixtures) {
  for (const [page, reason] of Object.entries(fixtures)) {
    assert.ok(page.startsWith(`${shelfDirectory}/`) && page.endsWith("/index.html")
      && posix.normalize(page) === page && page !== `${shelfDirectory}/index.html`
      && typeof reason === "string" && reason.trim(),
    `${page}: a non-public fixture exemption needs an exact article file path and documented reason`);
  }

  function visit(directory) {
    const entries = readdirSync(resolve(root, directory), { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const page = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        visit(page);
      } else if (entry.isFile() && entry.name === "index.html"
        && page !== `${shelfDirectory}/index.html`
        && !Object.hasOwn(fixtures, page)) {
        const expectedRoute = `/${page.replace(/^public\//, "").replace(/index\.html$/, "")}`;
        assert.ok(routes.some(({ path, page: registeredPage }) => (
          registeredPage === page && path === expectedRoute
        )), `${page}: unregistered Vibing Now article; expected route ${expectedRoute} in shared/public-routes.js`);
      }
    }
  }

  visit(shelfDirectory);
}