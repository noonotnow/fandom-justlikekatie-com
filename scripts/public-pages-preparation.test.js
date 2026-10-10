import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function preparationFixture(t) {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), "public-pages-preparation-"));
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));
  for (const path of [
    "package.json", "netlify.toml", "shared/public-routes.js", "shared/locale.js",
    "netlify/functions/lib/public-routes.js",
    "scripts/generate-public-pages.js", "scripts/where-to-watch.js",
    "scripts/untamed-name-key.js", "docs/untamed-three-character-name-key-review.md",
    "scripts/sect-day-pages.js",
    "scripts/static-guide-public-inventory.js", "scripts/vibing-public-inventory.js",
    "docs/against-the-current-availability.json",
    "public/c-drama-fandom", "public/c-dramas", "public/zh-cn",
    "public/assets/c-drama-fandom/trope-decoder.js",
  ]) {
    mkdirSync(dirname(resolve(fixtureRoot, path)), { recursive: true });
    cpSync(resolve(root, path), resolve(fixtureRoot, path), { recursive: true });
  }
  // Only inputs are shared; all generated output stays in the temporary project.
  symlinkSync(resolve(root, "node_modules"), resolve(fixtureRoot, "node_modules"), "dir");
  symlinkSync(resolve(root, "attached_assets"), resolve(fixtureRoot, "attached_assets"), "dir");
  const assets = resolve(fixtureRoot, "public/assets/c-drama-fandom");
  mkdirSync(assets, { recursive: true });
  for (const name of ["xianxia-fate-lg01-promo.mp4", "xianxia-fate-lg01-promo-poster.jpg"]) {
    writeFileSync(resolve(assets, name), "");
  }
  // Keep the synthetic record fresh without weakening the real publication gate.
  const recordPath = resolve(fixtureRoot, "docs/against-the-current-availability.json");
  const record = JSON.parse(readFileSync(recordPath, "utf8"), (key, value) => (
    key === "checkedAt" ? new Date().toISOString() : value
  ));
  writeFileSync(recordPath, JSON.stringify(record));
  return fixtureRoot;
}

function prepare(fixtureRoot) {
  // Exercise the release preparation entry point, without running inventory tests.
  return spawnSync(process.execPath, ["scripts/generate-public-pages.js"], {
    cwd: fixtureRoot, encoding: "utf8", timeout: 30_000,
  });
}

function assertInventoryFailure(result, page, kind) {
  assert.ifError(result.error);
  assert.equal(result.status, 1, result.stderr);
  const route = `/${page.replace(/^public\//, "").replace(/index\.html$/, "")}`;
  assert.ok(result.stderr.includes(
    `${page}: unregistered ${kind}; expected route ${route} in shared/public-routes.js`,
  ), result.stderr);
}

for (const [page, kind] of [
  ["public/c-drama-fandom/new-guide/index.html", "static C-drama guide"],
  ["public/c-dramas/new-drama/nested-guide/index.html", "static C-drama guide"],
  ["public/c-drama-fandom/fandom-games/previews/new-result/index.html", "static C-drama guide"],
  ["public/c-drama-fandom/vibing-now/drafts/new-article/index.html", "Vibing Now article"],
]) {
  test(`release preparation blocks an unregistered ${page}`, (t) => {
    const fixtureRoot = preparationFixture(t);
    mkdirSync(dirname(resolve(fixtureRoot, page)), { recursive: true });
    writeFileSync(resolve(fixtureRoot, page),
      '<meta name="robots" content="noindex"><h1>Synthetic non-public fixture</h1>');
    assertInventoryFailure(prepare(fixtureRoot), page, kind);
    assert.equal(existsSync(resolve(fixtureRoot, "public/sitemap.xml")), false);
  });
}

test("release preparation inventories journal pages after generating them", (t) => {
  const fixtureRoot = preparationFixture(t);
  const page = "public/c-drama-fandom/watch-journal/unregistered/index.html";
  const registry = resolve(fixtureRoot, "shared/public-routes.js");
  writeFileSync(registry, readFileSync(registry, "utf8").replace(
    'page: "public/c-drama-fandom/watch-journal/index.html"',
    `page: "${page}"`,
  ));
  const config = resolve(fixtureRoot, "netlify.toml");
  writeFileSync(config, readFileSync(config, "utf8").replaceAll(
    'to = "/c-drama-fandom/watch-journal/index.html"',
    'to = "/c-drama-fandom/watch-journal/unregistered/index.html"',
  ));
  rmSync(resolve(fixtureRoot, "public/c-drama-fandom/watch-journal/index.html"));
  assert.equal(existsSync(resolve(fixtureRoot, page)), false);
  assertInventoryFailure(prepare(fixtureRoot), page, "static C-drama guide");
  assert.match(readFileSync(resolve(fixtureRoot, page), "utf8"), /The public field journal/);
});

test("release preparation accepts registered pages and exact query-share previews", (t) => {
  const fixtureRoot = preparationFixture(t);
  rmSync(resolve(fixtureRoot, "public/c-drama-fandom/watch-journal"), { recursive: true });
  const result = prepare(fixtureRoot);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Prepared crawlable C-drama fandom pages/);
  assert.equal(existsSync(resolve(fixtureRoot, "public/c-drama-fandom/watch-journal/index.html")), true);
  assert.equal(existsSync(resolve(fixtureRoot, "public/sitemap.xml")), true);
});

test("registration still cannot bypass the where-to-watch source-review gate", (t) => {
  const fixtureRoot = preparationFixture(t);
  const path = resolve(fixtureRoot, "docs/against-the-current-availability.json");
  const record = JSON.parse(readFileSync(path, "utf8"));
  record.rightsReviewed = false;
  writeFileSync(path, JSON.stringify(record));
  const result = prepare(fixtureRoot);
  assert.ifError(result.error);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Where-to-watch publication blocked: reviewer and rights\/spoiler signoff/);
});