import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const script = readFileSync(new URL("../../../public/c-drama-fandom/companion-pilot.js", import.meta.url), "utf8");

function page(internal) {
  const requests = [];
  const handlers = {};
  const storage = new Map(internal ? [["companion-pilot-internal", "1"]] : []);
  const session = new Map();
  const link = { addEventListener(_event, handler) { handlers.click = handler; } };
  const form = { addEventListener(_event, handler) { handlers.submit = handler; } };
  const section = {
    dataset: { companionPath: "discover" },
    querySelectorAll() { return [link]; },
    querySelector(selector) { return selector === "form" ? form : { textContent: "" }; },
  };
  let tick;
  const context = {
    document: {
      querySelector(selector) { return selector === "[data-companion-path]" ? section : null; },
      visibilityState: "visible",
    },
    localStorage: { getItem: key => storage.get(key) ?? null },
    sessionStorage: {
      getItem: key => session.get(key) ?? null,
      setItem: (key, value) => session.set(key, value),
    },
    fetch: (_url, options) => {
      requests.push(JSON.parse(options.body));
      return Promise.resolve({ ok: true });
    },
    setInterval: handler => { tick = handler; return 1; },
    clearInterval: () => {},
    Date,
  };
  vm.runInNewContext(script, context);
  return { requests, handlers, session, tick };
}

test("internal browser profile contributes no pilot analytics or membership attribution", () => {
  const visit = page(true);
  assert.equal(visit.requests.length, 0);
  assert.equal(visit.tick, undefined);
  visit.handlers.click();
  assert.equal(visit.requests.length, 0);
  assert.equal(visit.session.has("companion-pilot-path"), false);
  assert.equal(typeof visit.handlers.submit, "function", "opt-out does not disable consent form");
});

test("reader profile still sends path and one ten-second qualified visit", () => {
  const visit = page(false);
  assert.equal(visit.requests[0].event, "companion_path_view");
  for (let i = 0; i < 10; i++) visit.tick();
  assert.equal(visit.requests[1].event, "companion_qualified_view");
  assert.equal(visit.session.get("companion-qualified:discover"), "1");
  visit.handlers.click();
  assert.equal(visit.session.get("companion-pilot-path"), "discover");
  assert.equal(visit.requests[2].event, "companion_collection_click");
});