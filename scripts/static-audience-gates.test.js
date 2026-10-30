import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { assertAudienceGatedHtml, assertStaticAudienceGates } from "./static-audience-gates.js";

const gate = '<script src="/audience-gate.js"></script>';

test("tracker-free pages remain tracker-free and shared-gate callers are allowed", () => {
  assert.doesNotThrow(() => assertAudienceGatedHtml("<h1>No tracking</h1>"));
  assert.doesNotThrow(() => assertAudienceGatedHtml(
    `${gate}<script>window.gtag('event', 'article_read');</script>`,
  ));
});

for (const [name, html] of [
  ["direct GA loader", '<script async src="https://www.googletagmanager.com/gtag/js?id=G-EXAMPLE"></script>'],
  ["inline GA config", '<script>gtag("config","G-EXAMPLE");</script>'],
  ["inline GTM loader", '<script>j.src="https://www.googletagmanager.com/gtm.js?id=GTM-EXAMPLE";</script>'],
  ["tracking iframe", '<iframe src="https://www.googletagmanager.com/ns.html?id=GTM-EXAMPLE"></iframe>'],
  ["raw queue push", `${gate}<script>window.dataLayer.push({event:"article_read"});</script>`],
  ["event before gate", `<script>gtag("event","early");</script>${gate}`],
  ["event without gate", '<script>window.gtag("event","early");</script>'],
  ["deferred gate", '<script defer src="/audience-gate.js"></script>'],
  ["async gate", '<script async src="/audience-gate.js"></script>'],
  ["duplicate gate", gate + gate],
]) {
  test(`rejects ${name}`, () => {
    assert.throws(() => assertAudienceGatedHtml(html, name), new RegExp(name));
  });
}

test("filesystem scan covers new nested non-index HTML, not only registered pages", () => {
  const root = mkdtempSync(join(tmpdir(), "fandom-audience-"));
  try {
    mkdirSync(join(root, "public/new-series"), { recursive: true });
    writeFileSync(join(root, "index.html"), gate);
    writeFileSync(join(root, "public/new-series/article.html"),
      '<script>gtag("config","G-EXAMPLE");</script>');
    assert.throws(() => assertStaticAudienceGates(root), /new-series\/article\.html/);
    writeFileSync(join(root, "public/new-series/article.html"), gate);
    assert.equal(assertStaticAudienceGates(root), 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("all checked-in public HTML avoids unconditional Google bootstraps", () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  assert.ok(assertStaticAudienceGates(root) > 3);
});