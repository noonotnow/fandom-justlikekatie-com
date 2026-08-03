import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createPlanHandoffHandler, deriveNextAction } from "./plan-handoff.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SITE_ORIGIN = "https://fandom.justlikekatie.com";
const MEDIA_URL = "https://media.example/upload";
const PLAN_URL = "https://plan.example/api/drafts";

const env = {
  MEDIA_UPLOAD_TOKEN: "media-only-token",
  MEDIA_UPLOAD_URL: MEDIA_URL,
  PLAN_REGISTRATION_TOKEN: "plan-only-token",
  PLAN_DRAFT_URL: PLAN_URL,
};

test("uploads media and registers the enriched draft with separate credentials", async () => {
  const calls = [];
  const handler = createPlanHandoffHandler({
    env,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url === MEDIA_URL) {
        assert.equal(init.headers.Authorization, "Bearer media-only-token");
        assert.equal(await init.body.get("file").text(), "generated-png");
        return Response.json({ url: "https://cdn.example/card.png" }, { status: 201 });
      }
      assert.equal(url, PLAN_URL);
      assert.equal(init.headers.Authorization, "Bearer plan-only-token");
      return Response.json({ ok: true, id: "plan-draft-id" });
    },
  });

  const response = await handler(handoffRequest(validDraft()));
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.deepEqual(body, {
    ok: true,
    id: "plan-draft-id",
    mediaUploadStatus: "attached",
    nextAction: "Review packet",
    mediaUrl: "https://cdn.example/card.png",
  });
  assert.equal(calls.length, 2);
  const registered = JSON.parse(calls[1].init.body);
  assert.equal(registered.mediaUrl, "https://cdn.example/card.png");
  assert.equal(registered.mediaUploadStatus, "attached");
  assert.equal(registered.type, "Static");
  assert.notEqual(registered.type, "Video");
  assert.equal(registered.nextAction, "Review packet");
  assert.match(registered.requirements, /Media attached/);
});

test("registers a media-blocked draft when upload fails", async () => {
  let registered;
  const handler = createPlanHandoffHandler({
    env,
    fetchImpl: async (url, init) => {
      if (url === MEDIA_URL) {
        return Response.json({ error: "R2 unavailable" }, { status: 503 });
      }
      registered = JSON.parse(init.body);
      return Response.json({ ok: true, id: "blocked-draft-id" });
    },
  });

  const response = await handler(handoffRequest(validDraft()));
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.id, "blocked-draft-id");
  assert.equal(body.mediaUploadStatus, "upload_failed");
  assert.equal(body.nextAction, "Attach media");
  assert.equal(body.mediaError, "R2 unavailable");
  assert.equal(registered.mediaUrl, undefined);
  assert.equal(registered.mediaUploadStatus, "upload_failed");
  assert.equal(registered.nextAction, "Attach media");
  assert.equal(registered.mediaError, "R2 unavailable");
  assert.match(registered.requirements, /Needs media/);
});

test("registers a successful media handoff with a caption blocker", async () => {
  let registered;
  const handler = createPlanHandoffHandler({
    env,
    fetchImpl: async (url, init) => {
      if (url === MEDIA_URL) {
        return Response.json({ url: "https://cdn.example/card.png" }, { status: 201 });
      }
      registered = JSON.parse(init.body);
      return Response.json({ ok: true, id: "caption-blocked-draft" });
    },
  });
  const draft = validDraft();
  draft.caption = "";

  const response = await handler(handoffRequest(draft));
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.nextAction, "Write caption");
  assert.equal(registered.nextAction, "Write caption");
});

test("bounds media upload time and still registers a media-blocked draft", async () => {
  let registered;
  const handler = createPlanHandoffHandler({
    env,
    uploadTimeoutMs: 5,
    fetchImpl: async (url, init) => {
      if (url === MEDIA_URL) {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      }
      registered = JSON.parse(init.body);
      return Response.json({ ok: true, id: "upload-timeout-draft" });
    },
  });

  const response = await handler(handoffRequest(validDraft()));
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.mediaUploadStatus, "upload_failed");
  assert.equal(body.nextAction, "Attach media");
  assert.match(body.mediaError, /Share-card upload timed out/);
  assert.match(registered.mediaError, /Share-card upload timed out/);
});

test("derives the first actionable blocker from the final draft state", () => {
  assert.equal(
    deriveNextAction({
      mediaUploadStatus: "attached",
      caption: "Ready caption",
    }),
    "Attach media",
  );
  assert.equal(
    deriveNextAction({
      mediaUploadStatus: "upload_failed",
      caption: "",
    }),
    "Attach media",
  );
  assert.equal(
    deriveNextAction({
      mediaUploadStatus: "attached",
      mediaUrl: "https://cdn.example/card.png",
      caption: "   ",
    }),
    "Write caption",
  );
  assert.equal(
    deriveNextAction({
      mediaUploadStatus: "attached",
      mediaUrl: "https://cdn.example/card.png",
      caption: "Ready caption",
    }),
    "Review packet",
  );
  assert.equal(
    deriveNextAction({
      mediaUploadStatus: "attached",
      mediaUrl: "https://cdn.example/card.png",
      caption: "Ready caption",
      packetReady: true,
    }),
    "Paste to XHS admin",
  );
});

test("preserves explicit later-stage actions during recovery", () => {
  assert.equal(
    deriveNextAction({
      mediaUploadStatus: "upload_failed",
      caption: "",
      nextAction: "Published",
    }),
    "Published",
  );
});

test("validates same-origin requests and draft fields before calling upstreams", async () => {
  let calls = 0;
  const handler = createPlanHandoffHandler({
    env,
    fetchImpl: async () => {
      calls += 1;
      throw new Error("must not be called");
    },
  });

  const crossOrigin = await handler(handoffRequest(validDraft(), "https://evil.example"));
  assert.equal(crossOrigin.status, 403);

  const invalid = validDraft();
  invalid.status = "Published";
  const invalidDraft = await handler(handoffRequest(invalid));
  assert.equal(invalidDraft.status, 400);
  assert.match((await invalidDraft.json()).error, /status must be Draft/);
  assert.equal(calls, 0);
});

test("rejects non-static Vibe handoffs before calling upstreams", async () => {
  let calls = 0;
  const handler = createPlanHandoffHandler({
    env,
    fetchImpl: async () => {
      calls += 1;
      throw new Error("must not be called");
    },
  });
  const draft = validDraft();
  draft.type = "Video";

  const response = await handler(handoffRequest(draft));

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /type must be Static/);
  assert.equal(calls, 0);
});

test("surfaces Posts Type schema diagnostics from PLAN registration", async () => {
  const handler = createPlanHandoffHandler({
    env,
    fetchImpl: async (url) => {
      if (url === MEDIA_URL) {
        return Response.json({ url: "https://cdn.example/card.png" }, { status: 201 });
      }
      return Response.json(
        { error: "Posts DB is missing Type with type select or multi_select" },
        { status: 503 },
      );
    },
  });

  const response = await handler(handoffRequest(validDraft()));

  assert.equal(response.status, 502);
  assert.equal(
    (await response.json()).error,
    "Posts DB is missing Type with type select or multi_select",
  );
});

test("keeps the PLAN timeout active while reading the response body", async () => {
  let registered;
  const handler = createPlanHandoffHandler({
    env,
    planTimeoutMs: 5,
    fetchImpl: async (url, init) => {
      if (url === MEDIA_URL) {
        return Response.json({ url: "https://cdn.example/card.png" }, { status: 201 });
      }
      registered = JSON.parse(init.body);
      return new Response(new ReadableStream({
        start(controller) {
          init.signal.addEventListener(
            "abort",
            () => controller.error(new Error("aborted")),
            { once: true },
          );
        },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  const response = await handler(handoffRequest(validDraft()));
  assert.equal(response.status, 504);
  assert.match((await response.json()).error, /PLAN draft registration timed out/);
  assert.equal(registered.nextAction, "Review packet");
});

test("keeps privileged handoff credentials out of browser source", () => {
  const browserSource = sourceFiles(join(REPO_ROOT, "src"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");

  assert.doesNotMatch(browserSource, /VITE_[A-Z0-9_]*SECRET/);
  assert.doesNotMatch(browserSource, /MEDIA_UPLOAD_TOKEN|PLAN_REGISTRATION_TOKEN/);
  assert.doesNotMatch(browserSource, /xhs\.justlikekatie\.com\/api\/integrations\/media/);
  assert.doesNotMatch(browserSource, /plan\.justlikekatie\.com\/api\/drafts/);
  assert.match(browserSource, /\/api\/plan-handoff/);
});

function handoffRequest(draft, origin = SITE_ORIGIN) {
  const form = new FormData();
  form.append("file", new File(["generated-png"], "card.png", { type: "image/png" }));
  form.append("draft", JSON.stringify(draft));
  return new Request(`${SITE_ORIGIN}/api/plan-handoff`, {
    method: "POST",
    headers: { Origin: origin },
    body: form,
  });
}

function validDraft() {
  return {
    headline: "Shattered Beauty — Liu Xueyi",
    caption: "漂亮得不太稳定",
    captionSeed: "漂亮得不太稳定",
    platform: "Rednote",
    series: "A·Vibe",
    type: "Static",
    status: "Draft",
    origin: "Automated",
    campaign: "Vibe Atlas Rednote Launch",
    event: "Vibe Atlas Rednote Launch",
    actor: "刘学义",
    actorEn: "Liu Xueyi",
    actorId: "liu-xueyi",
    vibe: "碎裂美感",
    vibeEn: "Shattered Beauty",
    mediaUploadStatus: "upload_failed",
    provenance: {
      sourceUrl: `${SITE_ORIGIN}/?admin=true`,
      sourceImageUrl: "https://source.example/selected.jpg",
      sourceContentUrl: "https://source.example/page",
      itemId: "https://source.example/selected.jpg",
      batchKey: "selected-query",
      cardId: "vibe-atlas-2026-07-31-liu-xueyi-card-4-abc",
      gridId: "vibe-atlas-2026-07-31-liu-xueyi",
      gridPosition: 4,
      actorId: "liu-xueyi",
      actorName: "刘学义",
      generatedAt: "2026-07-31T13:00:00.000Z",
      prompt: "editorial fractured-glass portrait",
      query: "刘学义 破碎感 氛围",
    },
    requirements: "Needs media: share-card upload failed",
  };
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}
