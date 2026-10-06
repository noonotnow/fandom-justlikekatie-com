import assert from "node:assert/strict";
import test from "node:test";
import { startViteTestServer } from "./browserEngines.js";

test("retired wedding URLs redirect permanently to the corrected reading in preview", async () => {
  const { server, origin } = await startViteTestServer();
  const old = "/c-drama-fandom/vibing-now/against-the-current-episodes-26-30";
  const target = "/c-drama-fandom/vibing-now/against-the-current-episodes-26-29/";
  try {
    for (const suffix of ["", "/", "/index.html"]) {
      const response = await fetch(`${origin}${old}${suffix}?utm_source=legacy`, { redirect: "manual" });
      assert.equal(response.status, 301);
      assert.equal(response.headers.get("location"), `${target}?utm_source=legacy`);
      const current = await fetch(`${origin}${response.headers.get("location")}`);
      assert.equal(current.status, 200);
      const html = await current.text();
      assert.ok(html.includes(`rel="canonical" href="https://fandom.justlikekatie.com${target}"`));
      assert.ok(html.includes("stops at the end of Episode 29"));
      assert.ok(!html.includes("vibing-discussion.js"));
    }
  } finally {
    await server.close();
  }
});
