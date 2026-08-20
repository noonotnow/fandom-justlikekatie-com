import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MIDDLE_EARTH_AI_URL,
  generateRednoteCopy,
  generateVisualObject,
  middleEarthGroundingFingerprint,
} from '../src/utils/middleEarthAi.ts';
import type { MiddleEarthGroundingInput } from '../src/utils/middleEarthAi.ts';

function withFetch(
  implementation: typeof fetch,
  run: () => Promise<void>,
): Promise<void> {
  const previous = globalThis.fetch;
  globalThis.fetch = implementation;
  return run().finally(() => {
    globalThis.fetch = previous;
  });
}

test('visual generation sends the bounded editor context to the same-origin AI route', async () => {
  let seenUrl = '';
  let seenInit: RequestInit | undefined;
  await withFetch(async (url, init) => {
    seenUrl = String(url);
    seenInit = init;
    return Response.json({
      result: {
        title: 'A small truth',
        primaryText: 'Even wizards need a second draft.',
        secondaryText: 'Moria was not in the content calendar.',
        layout: 'Editorial caption',
        rationale: 'The source image leaves room below.',
        model: 'grok-test',
      },
    });
  }, async () => {
    const result = await generateVisualObject({
      character: 'Gandalf',
      memeFlavor: 'One Does Not Simply',
      aesthetic: 'Epic parchment',
      artifactType: 'Meme card',
      tone: 'Deadpan',
      layout: 'Classic top / bottom',
      guidance: 'Quiet workplace humor',
      source: {
        title: 'Gandalf portrait',
        sourceUrl: 'https://publisher.example/gandalf',
        publisher: 'Publisher',
        query: 'Gandalf',
      },
    });
    assert.equal(result.layout, 'Editorial caption');
  });

  assert.equal(seenUrl, MIDDLE_EARTH_AI_URL);
  assert.equal(seenInit?.method, 'POST');
  assert.equal(seenInit?.credentials, 'same-origin');
  const body = JSON.parse(String(seenInit?.body));
  assert.equal(body.mode, 'visual');
  assert.equal(body.character, 'Gandalf');
  assert.equal(body.memeFlavor, 'One Does Not Simply');
  assert.equal(body.aesthetic, 'Epic parchment');
  assert.equal(body.artifactType, 'Meme card');
  assert.equal(body.source.sourceUrl, 'https://publisher.example/gandalf');
});

test('Rednote generation carries final visual copy and editable refinement context', async () => {
  let body: Record<string, unknown> = {};
  await withFetch(async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return Response.json({
      result: {
        title: 'The wizard had a point',
        caption: 'A finished Rednote caption.',
        tags: ['#MiddleEarth', '#Gandalf', '#Fandom'],
      },
    });
  }, async () => {
    const result = await generateRednoteCopy({
      character: 'Gandalf',
      memeFlavor: 'Council of Elrond',
      aesthetic: 'Chaotic group chat',
      artifactType: 'Carousel slide',
      tone: 'Deadpan',
      layout: 'Tiny confession',
      visual: {
        title: 'A small truth',
        primaryText: 'Even wizards need a second draft.',
        layout: 'Tiny confession',
      },
      currentCopy: {
        title: 'Keep this idea',
        caption: 'Refine this draft.',
        tags: ['#MiddleEarth', '#Gandalf', '#Fandom'],
      },
    });
    assert.equal(result.tags.length, 3);
  });

  assert.equal(body.mode, 'rednote');
  assert.equal(body.memeFlavor, 'Council of Elrond');
  assert.equal(body.aesthetic, 'Chaotic group chat');
  assert.equal(body.artifactType, 'Carousel slide');
  assert.deepEqual(
    (body.visual as { primaryText: string }).primaryText,
    'Even wizards need a second draft.',
  );
  assert.equal((body.currentCopy as { title: string }).title, 'Keep this idea');
});

test('AI route errors are surfaced without accepting malformed success bodies', async () => {
  await withFetch(async () => Response.json({ error: 'Try again later.' }, { status: 429 }), async () => {
    await assert.rejects(
      () => generateVisualObject({
        character: 'Éowyn',
        tone: 'Dramatic',
        layout: 'Editorial caption',
      }),
      /Try again later/,
    );
  });

  await withFetch(async () => Response.json({ mode: 'visual' }), async () => {
    await assert.rejects(
      () => generateVisualObject({
        character: 'Éowyn',
        tone: 'Dramatic',
        layout: 'Editorial caption',
      }),
      /invalid result/,
    );
  });
});

test('Rednote grounding changes when any creative grammar, visual, direction, or source dependency changes', () => {
  const base = {
    character: 'Samwise',
    memeFlavor: 'Samwise Loyalty',
    aesthetic: 'Cozy Hobbiton',
    artifactType: 'Meme card',
    tone: 'Tender',
    layout: 'Editorial caption',
    guidance: 'Quiet competence',
    source: {
      id: 'source-1',
      title: 'Sam on the road',
      sourceUrl: 'https://publisher.example/sam',
      publisher: 'Publisher',
      query: 'Samwise road',
    },
    visual: {
      title: 'The real ring-bearer',
      primaryText: 'Some people carry the plan. Sam carried the people.',
      secondaryText: 'Quiet competence, Shire edition.',
    },
  } satisfies MiddleEarthGroundingInput;
  const fingerprint = middleEarthGroundingFingerprint(base);
  const variants = [
    { ...base, character: 'Frodo' },
    { ...base, memeFlavor: 'Council of Elrond' as const },
    { ...base, aesthetic: 'Illuminated manuscript' as const },
    { ...base, artifactType: 'Hero card' as const },
    { ...base, tone: 'Deadpan' },
    { ...base, layout: 'Tiny confession' },
    { ...base, guidance: 'A different direction' },
    { ...base, source: { ...base.source, id: 'source-2' } },
    { ...base, source: { ...base.source, sourceUrl: 'https://publisher.example/sam-2' } },
    { ...base, visual: { ...base.visual, title: 'A revised title' } },
    { ...base, visual: { ...base.visual, primaryText: 'Revised primary copy.' } },
    { ...base, visual: { ...base.visual, secondaryText: 'Revised secondary copy.' } },
  ];
  for (const variant of variants) {
    assert.notEqual(middleEarthGroundingFingerprint(variant), fingerprint);
  }
  assert.equal(middleEarthGroundingFingerprint(structuredClone(base)), fingerprint);
});