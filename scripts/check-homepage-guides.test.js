import assert from "node:assert/strict";
import test from "node:test";
import { checkHomepageBundle, GUIDE_DESTINATIONS } from "./check-homepage-guides.js";

const origin = "https://example.test";
const bundle = `More guides ${GUIDE_DESTINATIONS.map(([label]) => label).join(" ")}`;

function fixture({ homepage = '<script type="module" src="/assets/index-123.js"></script>', code = bundle, status = 200, type = "text/javascript" } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return url === `${origin}/`
      ? new Response(homepage, { headers: { "Content-Type": "text/html" } })
      : new Response(code, { status, headers: { "Content-Type": type } });
  };
  return { fetchImpl, calls };
}

test("reads the live homepage's referenced bundle rather than workspace source", async () => {
  const { fetchImpl, calls } = fixture();
  await checkHomepageBundle(fetchImpl, origin);
  assert.deepEqual(calls.map(call => call.url), [`${origin}/`, `${origin}/assets/index-123.js`]);
  assert.ok(calls.every(call => call.options.redirect === "manual"));
});

test("rejects a deployed bundle without the menu even when the homepage loads", async () => {
  await assert.rejects(checkHomepageBundle(fixture({ code: "Old homepage" }).fetchImpl, origin), /do not contain the More guides menu/);
  await assert.rejects(checkHomepageBundle(fixture({ code: "More guides Glossary" }).fetchImpl, origin), /do not contain the More guides menu/);
});

test("rejects missing, redirected, or non-JavaScript bundles and cross-origin references", async () => {
  await assert.rejects(checkHomepageBundle(fixture({ homepage: "<body>Old homepage</body>" }).fetchImpl, origin), /does not reference a JavaScript bundle/);
  await assert.rejects(checkHomepageBundle(fixture({ status: 302 }).fetchImpl, origin), /returned HTTP 302/);
  await assert.rejects(checkHomepageBundle(fixture({ type: "text/html" }).fetchImpl, origin), /is not JavaScript/);
  await assert.rejects(checkHomepageBundle(fixture({ homepage: '<script src="https://other.test/index.js"></script>' }).fetchImpl, origin), /same-origin/);
});