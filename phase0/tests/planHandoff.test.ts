import assert from 'node:assert/strict';
import test from 'node:test';
import type { StarOfDayData } from '../src/hooks/useStarOfDay';
import {
  buildPlanDraftPayload,
  sendPlanDraft,
  uploadSelectedCard,
  uploadShareCard,
} from '../src/utils/planHandoff.ts';

const data: StarOfDayData = {
  actorId: 'liu-xueyi',
  actorName: '刘学义',
  actorShortNameEn: 'Liu Xueyi',
  actorAccentColor: '#123456',
  vibeEmoji: '✨',
  vibeLabel: '碎裂美感',
  vibeLabelEn: 'Shattered Beauty',
  vibeSubtitle: '漂亮得不太稳定',
  vibeSubtitleEn: 'Beauty on the verge',
  date: '2026-07-31',
  generatedAt: '2026-07-31T13:00:00.000Z',
  generationPrompt: 'editorial fractured-glass portrait',
  generationQuery: '刘学义 破碎感 氛围',
  rankedBatches: [],
};

test('builds an enriched media-ready PLAN payload with established defaults', () => {
  const payload = buildPlanDraftPayload({
    data,
    image: {
      id: 'https://source.example/selected.jpg',
      title: 'Selected',
      thumbnail: '/.netlify/functions/image-proxy?url=selected',
      url: 'https://source.example/page',
      gridPosition: 4,
      batchKey: 'selected-query',
    },
    form: {
      headline: '  Shattered Beauty — Liu Xueyi ',
      caption: ' caption ',
      platform: 'Rednote',
      series: 'A·Vibe',
    },
    sourceUrl: 'https://fandom.justlikekatie.com/?admin=true',
    generatedAt: 'ignored',
    mediaUrl: 'https://cdn.justlikekatie.com/uploads/card.png',
  });

  assert.equal(payload.status, 'Draft');
  assert.equal(payload.origin, 'Automated');
  assert.equal(payload.platform, 'Rednote');
  assert.equal(payload.series, 'A·Vibe');
  assert.equal(payload.campaign, 'Vibe Atlas Rednote Launch');
  assert.equal(payload.event, 'Vibe Atlas Rednote Launch');
  assert.equal(payload.mediaUrl, 'https://cdn.justlikekatie.com/uploads/card.png');
  assert.equal(payload.mediaUploadStatus, 'attached');
  assert.equal(payload.actor, '刘学义');
  assert.equal(payload.actorEn, 'Liu Xueyi');
  assert.equal(payload.vibe, '碎裂美感');
  assert.equal(payload.vibeEn, 'Shattered Beauty');
  assert.equal(payload.captionSeed, '漂亮得不太稳定');
  assert.match(payload.provenance.cardId, /^vibe-atlas-2026-07-31-liu-xueyi-card-4-/);
  assert.equal(payload.provenance.gridId, 'vibe-atlas-2026-07-31-liu-xueyi');
  assert.equal(payload.provenance.itemId, 'https://source.example/selected.jpg');
  assert.equal(payload.provenance.sourceContentUrl, 'https://source.example/page');
  assert.equal(payload.provenance.gridPosition, 4);
  assert.equal(payload.provenance.generatedAt, data.generatedAt);
  assert.match(payload.requirements, /Media attached/);
  assert.doesNotMatch(payload.requirements, /Needs media/);
});

test('marks the draft as needing media when share-card upload fails', () => {
  const payload = buildPlanDraftPayload({
    data,
    image: {
      id: 'selected',
      title: 'Selected',
      thumbnail: '/selected',
      url: 'https://source.example/selected',
    },
    form: { headline: 'Headline', caption: '', platform: 'Rednote', series: 'A·Vibe' },
    sourceUrl: 'https://fandom.justlikekatie.com/',
    generatedAt: '2026-07-31T14:00:00.000Z',
    uploadError: 'R2 unavailable',
  });

  assert.equal(payload.mediaUploadStatus, 'upload_failed');
  assert.equal(payload.mediaUrl, undefined);
  assert.equal(payload.mediaError, 'R2 unavailable');
  assert.match(payload.requirements, /Needs media: share-card upload failed — R2 unavailable/);
});

test('uploads the generated PNG and accepts only a durable public URL', async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    assert.ok(init);
    assert.equal(init.method, 'POST');
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer secret');
    assert.ok(init.body instanceof FormData);
    return new Response(JSON.stringify({ url: 'https://cdn.example/card.png' }), { status: 201 });
  };

  const result = await uploadShareCard(new Blob(['png'], { type: 'image/png' }), 'secret', 'https://media.example/upload', fetchImpl);
  assert.equal(result.url, 'https://cdn.example/card.png');
});

test('renders and uploads the exact selected non-first individual card', async () => {
  const images = [
    {
      id: 'first-id',
      title: 'First',
      thumbnail: '/.netlify/functions/image-proxy?url=first',
      url: 'https://source.example/first',
      gridPosition: 0,
    },
    {
      id: 'selected-id',
      title: 'Selected',
      thumbnail: '/.netlify/functions/image-proxy?url=selected',
      url: 'https://source.example/selected',
      gridPosition: 1,
    },
  ];
  let renderedImageUrl = '';
  let uploadedBlobText = '';

  const result = await uploadSelectedCard(
    images[1],
    data,
    null,
    async (metadata) => {
      renderedImageUrl = metadata.imageUrl;
      return new Blob(['selected-individual-card'], { type: 'image/png' });
    },
    'secret',
    'https://media.example/upload',
    async (blob) => {
      uploadedBlobText = await blob.text();
      return { url: 'https://cdn.example/selected-card.png' };
    },
  );

  assert.equal(renderedImageUrl, images[1].thumbnail);
  assert.notEqual(renderedImageUrl, images[0].thumbnail);
  assert.equal(uploadedBlobText, 'selected-individual-card');
  assert.equal(result.url, 'https://cdn.example/selected-card.png');

  const payload = buildPlanDraftPayload({
    data,
    image: images[1],
    form: { headline: 'Selected card', caption: '', platform: 'Rednote', series: 'A·Vibe' },
    sourceUrl: 'https://fandom.justlikekatie.com/',
    generatedAt: '2026-07-31T14:00:00.000Z',
    mediaUrl: result.url,
  });
  let sentPayload: unknown;
  await sendPlanDraft(
    payload,
    'secret',
    'https://plan.example/api/drafts',
    async (_input, init) => {
      sentPayload = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ ok: true, id: 'selected-page' }), { status: 200 });
    },
  );

  assert.equal(payload.provenance.itemId, images[1].id);
  assert.notEqual(payload.provenance.itemId, images[0].id);
  assert.equal(payload.mediaUrl, 'https://cdn.example/selected-card.png');
  assert.deepEqual(sentPayload, payload);
});

test('surfaces upload failures and never accepts blob URLs', async () => {
  const failedFetch: typeof fetch = async () => (
    new Response(JSON.stringify({ error: 'R2 write failed' }), { status: 503 })
  );
  await assert.rejects(
    uploadShareCard(new Blob(['png']), 'secret', 'https://media.example/upload', failedFetch),
    /R2 write failed/,
  );

  const temporaryFetch: typeof fetch = async () => (
    new Response(JSON.stringify({ url: 'blob:https://fandom.example/temporary' }), { status: 201 })
  );
  await assert.rejects(
    uploadShareCard(new Blob(['png']), 'secret', 'https://media.example/upload', temporaryFetch),
    /durable public URL/,
  );

  for (const url of [
    'http://cdn.example/card.png',
    'https://localhost/card.png',
    'https://127.0.0.1/card.png',
    'https://192.168.1.2/card.png',
  ]) {
    const privateFetch: typeof fetch = async () => (
      new Response(JSON.stringify({ url }), { status: 201 })
    );
    await assert.rejects(
      uploadShareCard(new Blob(['png']), 'secret', 'https://media.example/upload', privateFetch),
      /durable public URL/,
    );
  }
});

test('sends the exact enriched JSON payload to PLAN', async () => {
  const payload = buildPlanDraftPayload({
    data,
    image: {
      id: 'selected',
      title: 'Selected',
      thumbnail: '/selected',
      url: 'https://source.example/selected',
    },
    form: { headline: 'Headline', caption: 'Caption', platform: 'Rednote', series: 'A·Vibe' },
    sourceUrl: 'https://fandom.justlikekatie.com/',
    generatedAt: '2026-07-31T14:00:00.000Z',
    mediaUrl: 'https://cdn.example/card.png',
  });
  const fetchImpl: typeof fetch = async (_input, init) => {
    assert.ok(init);
    assert.deepEqual(JSON.parse(String(init.body)), payload);
    return new Response(JSON.stringify({ ok: true, id: 'notion-page-id' }), { status: 200 });
  };

  assert.deepEqual(
    await sendPlanDraft(payload, 'secret', 'https://plan.example/api/drafts', fetchImpl),
    { ok: true, id: 'notion-page-id' },
  );
});
