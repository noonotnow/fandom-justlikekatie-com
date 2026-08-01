import assert from 'node:assert/strict';
import test from 'node:test';
import type { StarOfDayData } from '../src/hooks/useStarOfDay';
import {
  buildPlanDraftPayload,
  renderGridCardPng,
  renderSelectedCardPng,
  sendPlanHandoff,
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
    selection: {
      kind: 'individual',
      image: {
        id: 'https://source.example/selected.jpg',
        title: 'Selected',
        thumbnail: '/.netlify/functions/image-proxy?url=selected',
        url: 'https://source.example/page',
        gridPosition: 4,
        batchKey: 'selected-query',
      },
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
    selection: {
      kind: 'individual',
      image: {
        id: 'selected',
        title: 'Selected',
        thumbnail: '/selected',
        url: 'https://source.example/selected',
      },
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

test('posts the generated PNG and exact draft to the same-origin handoff', async () => {
  const payload = buildPlanDraftPayload({
    data,
    selection: { kind: 'grid' },
    form: { headline: 'Grid', caption: '', platform: 'Rednote', series: 'A·Vibe' },
    sourceUrl: 'https://fandom.justlikekatie.com/',
    generatedAt: '2026-07-31T14:00:00.000Z',
  });
  const fetchImpl: typeof fetch = async (_input, init) => {
    assert.ok(init);
    assert.equal(init.method, 'POST');
    assert.ok(init.body instanceof FormData);
    assert.equal(await (init.body.get('file') as File).text(), 'png');
    assert.deepEqual(JSON.parse(String(init.body.get('draft'))), payload);
    return new Response(JSON.stringify({
      ok: true,
      id: 'draft-id',
      mediaUploadStatus: 'attached',
      nextAction: 'Review packet',
      mediaUrl: 'https://cdn.example/card.png',
    }), { status: 201 });
  };

  const result = await sendPlanHandoff(
    new Blob(['png'], { type: 'image/png' }),
    payload,
    '/api/plan-handoff',
    fetchImpl,
  );
  assert.equal(result.mediaUrl, 'https://cdn.example/card.png');
  assert.equal(result.nextAction, 'Review packet');
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

  const blob = await renderSelectedCardPng(
    images[1],
    data,
    null,
    async (metadata) => {
      renderedImageUrl = metadata.imageUrl;
      return new Blob(['selected-individual-card'], { type: 'image/png' });
    },
  );

  assert.equal(renderedImageUrl, images[1].thumbnail);
  assert.notEqual(renderedImageUrl, images[0].thumbnail);
  assert.equal(await blob.text(), 'selected-individual-card');

  const payload = buildPlanDraftPayload({
    data,
    selection: { kind: 'individual', image: images[1] },
    form: { headline: 'Selected card', caption: '', platform: 'Rednote', series: 'A·Vibe' },
    sourceUrl: 'https://fandom.justlikekatie.com/',
    generatedAt: '2026-07-31T14:00:00.000Z',
  });

  assert.equal(payload.provenance.itemId, images[1].id);
  assert.notEqual(payload.provenance.itemId, images[0].id);
});

test('renders and uploads the full 3x3 grid card for the grid-level action', async () => {
  let renderedData: StarOfDayData | undefined;
  let renderedVariant = '';
  const fakeCanvas = {
    toBlob(callback: BlobCallback) {
      callback(new Blob(['full-3x3-grid-card'], { type: 'image/png' }));
    },
  } as HTMLCanvasElement;

  const blob = await renderGridCardPng(
    data,
    async (receivedData, variant) => {
      renderedData = receivedData;
      renderedVariant = variant;
      return fakeCanvas;
    },
  );

  assert.equal(renderedData, data);
  assert.equal(renderedVariant, 'full');
  assert.equal(await blob.text(), 'full-3x3-grid-card');

  const payload = buildPlanDraftPayload({
    data,
    selection: { kind: 'grid' },
    form: { headline: 'Full grid', caption: '', platform: 'Rednote', series: 'A·Vibe' },
    sourceUrl: 'https://fandom.justlikekatie.com/',
    generatedAt: '2026-07-31T14:00:00.000Z',
  });

  assert.equal(payload.provenance.itemId, 'vibe-atlas-2026-07-31-liu-xueyi');
  assert.equal(payload.provenance.cardId, 'vibe-atlas-2026-07-31-liu-xueyi-grid');
  assert.equal(payload.provenance.gridPosition, undefined);
  assert.equal(payload.provenance.sourceImageUrl, undefined);
});

test('surfaces handoff failures and never accepts blob media URLs', async () => {
  const payload = buildPlanDraftPayload({
    data,
    selection: { kind: 'grid' },
    form: { headline: 'Grid', caption: '', platform: 'Rednote', series: 'A·Vibe' },
    sourceUrl: 'https://fandom.justlikekatie.com/',
    generatedAt: '2026-07-31T14:00:00.000Z',
  });
  const failedFetch: typeof fetch = async () => (
    new Response(JSON.stringify({ error: 'PLAN unavailable' }), { status: 502 })
  );
  await assert.rejects(
    sendPlanHandoff(new Blob(['png']), payload, '/api/plan-handoff', failedFetch),
    /PLAN unavailable/,
  );

  const temporaryFetch: typeof fetch = async () => (
    new Response(JSON.stringify({
      ok: true,
      id: 'draft',
      mediaUploadStatus: 'attached',
      nextAction: 'Review packet',
      mediaUrl: 'blob:https://fandom.example/temporary',
    }), { status: 201 })
  );
  await assert.rejects(
    sendPlanHandoff(new Blob(['png']), payload, '/api/plan-handoff', temporaryFetch),
    /temporary or invalid media URL/,
  );
});

test('returns media-blocked handoff results without treating them as failures', async () => {
  const payload = buildPlanDraftPayload({
    data,
    selection: { kind: 'grid' },
    form: { headline: 'Headline', caption: 'Caption', platform: 'Rednote', series: 'A·Vibe' },
    sourceUrl: 'https://fandom.justlikekatie.com/',
    generatedAt: '2026-07-31T14:00:00.000Z',
  });

  assert.deepEqual(
    await sendPlanHandoff(
      new Blob(['png']),
      payload,
      '/api/plan-handoff',
      async () => new Response(JSON.stringify({
        ok: true,
        id: 'notion-page-id',
        mediaUploadStatus: 'upload_failed',
        nextAction: 'Attach media',
        mediaError: 'R2 unavailable',
      }), { status: 201 }),
    ),
    {
      ok: true,
      id: 'notion-page-id',
      mediaUploadStatus: 'upload_failed',
      nextAction: 'Attach media',
      mediaError: 'R2 unavailable',
    },
  );
});
