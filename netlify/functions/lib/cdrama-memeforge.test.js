import test from "node:test";
import assert from "node:assert/strict";
import { createCdramaMemeHandler, validateIdeas } from "./cdrama-memeforge.js";

const ideas = [
  { setup: "Me: one episode before bed.", punchline: "The credits: good morning.", visualDirection: "Wide-eyed heroine caught by surprise", searchQuery: "C-drama wide eyes reaction still" },
  { setup: "The mentor calls it a minor test.", punchline: "The sky files a complaint.", visualDirection: "Disbelieving ensemble looking upward", searchQuery: "xianxia shocked ensemble still" },
  { setup: "I brought snacks for a quick errand.", punchline: "The group chat appointed me sect leader.", visualDirection: "Reluctant leader faces chaotic crowd", searchQuery: "Chinese costume drama group reaction still" },
];

function harness({ authorized = true, fail = false } = {}) {
  let calls = 0;
  let count = 0;
  const prompts = [];
  const client = {
    async proxy(provider, path, options) {
      assert.equal(provider, "xai");
      calls++;
      if (path === "/v1/language-models") return Response.json({ data: [{ id: "grok-test" }] });
      const input = JSON.parse(options.body);
      prompts.push(input.messages[0].content);
      assert.equal(input.model, "grok-test");
      assert.match(input.messages[0].content, /C-drama/);
      assert.doesNotMatch(input.messages[0].content, /Middle-earth|Rednote/);
      if (fail) return new Response(null, { status: 503 });
      return Response.json({ choices: [{ message: { content: JSON.stringify({ ideas }) } }] });
    },
  };
  const handler = createCdramaMemeHandler({
    auth: { authenticate: async () => {
      if (!authorized) throw Object.assign(new Error("expired"), { status: 401 });
      return { user: { accountId: "member" } };
    } },
    getStore: () => ({
      getWithMetadata: async () => count ? { data: { count }, etag: `etag-${count}` } : null,
      setJSON: async () => { count++; return { modified: true }; },
    }),
    makeConnectorClient: () => client,
    now: () => 123456789,
  });
  const request = (input = { moment: "I planned one episode", context: "", lane: "fandom" }, origin = "https://example.test") =>
    handler(new Request("https://example.test/.netlify/functions/cdrama-memeforge", {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }), {});
  return { request, getCalls: () => calls, prompts };
}

test("conversational scene intent stays primary instead of forcing three unrelated comedy lanes", async () => {
  const studio = harness();
  const moment = 'The villain in Where the Mask Ends gets caught and delivers her MEI CUO monologue. I want that big dramatic defense speech.';
  assert.equal((await studio.request({ moment, context: "", lane: "fandom" })).status, 200);
  const prompt = studio.prompts[0];
  assert.ok(prompt.includes(JSON.stringify(moment)));
  assert.match(prompt, /Preserve that intent in ALL THREE options/);
  assert.match(prompt, /brief OR context supplies a drama/);
  assert.match(prompt, /keep the most useful supplied source anchor/);
  assert.match(prompt, /without inventing translations/);
  assert.doesNotMatch(prompt, /in this order: 1\)|input is inspiration/);
});

test("C-drama generation returns three validated jokes from a signed-in request", async () => {
  const { request, getCalls } = harness();
  const response = await request();
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).ideas, ideas);
  assert.equal(getCalls(), 2);
});
test("expired sessions and invalid input never call the model", async () => {
  const guest = harness({ authorized: false });
  assert.equal((await guest.request()).status, 401);
  assert.equal(guest.getCalls(), 0);
  const studio = harness();
  assert.equal((await studio.request({ moment: "", context: "", lane: "fandom" })).status, 400);
  assert.equal((await studio.request({ moment: "hi", context: "", lane: "shopping" })).status, 400);
  assert.equal((await studio.request(undefined, "https://elsewhere.test")).status, 403);
  assert.equal(studio.getCalls(), 0);
});
test("rate limiting and provider failures fail explicitly, never fabricate ideas", async () => {
  const { request } = harness();
  for (let n = 0; n < 12; n++) assert.equal((await request()).status, 200);
  assert.equal((await request()).status, 429);
  const broken = await harness({ fail: true }).request();
  assert.equal(broken.status, 503);
  assert.equal((await broken.json()).ideas, undefined);
});
test("contract rejects legacy, commercial, duplicate, and incomplete copy", () => {
  for (const changed of [
    { ...ideas[0], punchline: "Ask Gandalf" },
    { ...ideas[0], setup: "Buy now" },
    { ...ideas[0], searchQuery: "" },
    { ...ideas[0], setup: ideas[1].setup, punchline: ideas[1].punchline },
  ]) {
    assert.throws(() => validateIdeas({ ideas: [changed, ...ideas.slice(1)] }));
  }
  assert.throws(() => validateIdeas({ ideas: ideas.slice(1) }));
});

test("one-line memes are valid without forcing an explanatory second beat", () => {
  const oneLine = { ...ideas[0], setup: "the fire starter when they discover there's a fire", punchline: "" };
  assert.equal(validateIdeas({ ideas: [oneLine, ...ideas.slice(1)] })[0].punchline, "");
  assert.throws(() => validateIdeas({ ideas: [{ ...oneLine, setup: "" }, ...ideas.slice(1)] }));
});

test("calibration preserves simple humor, subject versus comparison, and separate evidence levels", async () => {
  const studio = harness();
  assert.equal((await studio.request()).status, 200);
  const prompt = studio.prompts[0];
  assert.match(prompt, /Deep context in, simple funny out/);
  assert.match(prompt, /not templates to copy/);
  assert.match(prompt, /do not silently replace the original subject with Wu Huan/);
  assert.match(prompt, /Character fit, scene fit, and image-from-scene/);
  assert.doesNotMatch(prompt, /setup ABOVE a clean still/);
});
