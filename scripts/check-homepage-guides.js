import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { PUBLIC_ORIGIN } from "../shared/public-routes.js";

export const GUIDE_DESTINATIONS = Object.freeze([
  ["Glossary (English)", "/c-drama-fandom/glossary/"],
  ["Archetypes (English)", "/c-drama-fandom/archetypes/"],
  ["Veteran journal (English)", "/c-drama-fandom/watch-journal/"],
  ["Vibing Now (English)", "/c-drama-fandom/vibing-now/"],
]);

async function getPublicHtml(url, fetchImpl) {
  const response = await fetchImpl(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: "text/html" },
  });
  assert.equal(response.status, 200, `${url} returned HTTP ${response.status}`);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i, `${url} is not HTML`);
  return response.text();
}

export async function checkHomepageBundle(fetchImpl = fetch, origin = PUBLIC_ORIGIN) {
  const html = await getPublicHtml(`${origin}/`, fetchImpl);
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js(?:\?[^"']*)?)["'][^>]*>/gi)]
    .map(match => new URL(match[1], origin));
  assert.ok(scripts.length, "Live homepage does not reference a JavaScript bundle");
  for (const url of scripts) {
    assert.equal(url.origin, origin, "Homepage JavaScript bundle must be same-origin");
    const response = await fetchImpl(url.href, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
    assert.equal(response.status, 200, `Homepage bundle ${url.href} returned HTTP ${response.status}`);
    assert.match(response.headers.get("content-type") ?? "", /^(?:text|application)\/javascript\b/i, `${url.href} is not JavaScript`);
    const bundle = await response.text();
    if (bundle.includes("More guides") && GUIDE_DESTINATIONS.every(([label]) => bundle.includes(label))) {
      console.log(`Verified live homepage menu in bundle: ${url.href}`);
      return;
    }
  }
  assert.fail("Live homepage bundles do not contain the More guides menu and its four guide labels");
}

// Apply both protections before the first navigation: the currently deployed
// pilot script may not honor the internal opt-out yet.
export async function prepareGuideSmokeContext(context) {
  await context.addInitScript(() => {
    localStorage.setItem("companion-pilot-internal", "1");
  });
  await context.route("**/.netlify/functions/log-engagement", route => route.abort());
}

export async function checkRenderedHomepageGuides(browser, origin = PUBLIC_ORIGIN) {
  const context = await browser.newContext();
  await prepareGuideSmokeContext(context);
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  page.setDefaultNavigationTimeout(20_000);
  // This smoke check must not write to production analytics.
  await page.route(/googletagmanager\.com|google-analytics\.com|\/api\/analytics(?:\/|$|\?)/, route => route.abort());
  try {
    for (const [label, path] of GUIDE_DESTINATIONS) {
      const home = await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
      assert.equal(home?.status(), 200, "Live homepage did not load");
      const nav = page.getByRole("navigation", { name: "Explore C-drama fandom" });
      const button = nav.getByRole("button", { name: /More guides/ });
      await button.waitFor({ state: "visible" });
      assert.equal(await button.getAttribute("aria-expanded"), "false", "More guides must start closed");
      await button.click();
      assert.equal(await button.getAttribute("aria-expanded"), "true", "More guides did not open");
      const links = nav.locator("#fandom-guide-menu a");
      assert.equal(await links.count(), GUIDE_DESTINATIONS.length, "More guides must expose exactly four links");
      for (const [expectedLabel, expectedPath] of GUIDE_DESTINATIONS) {
        assert.equal(
          await nav.getByRole("link", { name: expectedLabel, exact: true }).getAttribute("href"),
          expectedPath,
          `${expectedLabel} has the wrong destination`,
        );
      }
      const response = await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded" }),
        nav.getByRole("link", { name: label, exact: true }).click(),
      ]).then(([navigation]) => navigation);
      assert.equal(response?.status(), 200, `${label} did not resolve to a public page`);
      assert.equal(new URL(page.url()).href, `${origin}${path}`, `${label} redirected to another page`);
      assert.match(response.headers()["content-type"] ?? "", /^text\/html\b/i, `${label} is not HTML`);
      assert.equal(
        await page.locator('link[rel="canonical"]').getAttribute("href"),
        `${PUBLIC_ORIGIN}${path}`,
        `${label} did not resolve to its expected public guide page`,
      );
      console.log(`Verified live guide: ${label} (${page.url()})`);
    }
  } finally {
    await context.close();
  }
}

export async function checkHomepageGuides(fetchImpl = fetch, browserType = chromium, origin = PUBLIC_ORIGIN) {
  await checkHomepageBundle(fetchImpl, origin);
  const browser = await browserType.launch({ headless: true });
  try {
    await checkRenderedHomepageGuides(browser, origin);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await checkHomepageGuides();
}