import assert from 'node:assert/strict';
import test from 'node:test';
import {
  completeIdeaPacketHandoff,
  loadRequiredGridImages,
  packetIndividualRenderInput,
  sendIdeaPacketToCreate,
  type RenderedPacketOutput,
} from '../src/utils/createHandoffClient.ts';
import type { IdeaPacket } from '../src/utils/ideaPackets.ts';

function packet(): IdeaPacket {
  return {
    id: 'packet-1',
    version: 'packet-version-1',
    state: 'media_compiled',
    createdAt: '2026-08-05T12:00:00.000Z',
    updatedAt: '2026-08-05T12:00:00.000Z',
    actor: { id: 'star', name: '明星', nameEn: 'Star' },
    vibe: { label: '氛围', labelEn: 'Vibe', emoji: '✨' },
    provenance: {
      sourceRoute: '/?admin=true',
      gridId: 'grid-1',
      generatedAt: '2026-08-05T12:00:00.000Z',
      resultIds: ['result-1'],
      batchKeys: ['batch-1'],
    },
    anchor: { imageUrls: ['https://images.example/grid.jpg'], label: 'Star · Vibe' },
    sourceCards: [{
      id: 'media-1',
      order: 0,
      imageUrl: 'https://images.example/one.jpg',
      sourceUrl: 'https://publisher.example/one',
      title: 'One',
      capturedAt: '2026-08-05T12:00:00.000Z',
      resultId: 'result-1',
      provenance: '{}',
    }],
    media: [{
      id: 'media-1',
      imageUrl: 'https://images.example/one.jpg',
      sourceUrl: 'https://publisher.example/one',
      title: 'One',
      resultId: 'result-1',
      addedAt: '2026-08-05T12:00:00.000Z',
    }],
    outputs: [
      {
        id: 'grid-output',
        kind: 'grid',
        sourceId: 'grid-1',
        label: 'Rendered grid PNG',
        included: true,
        addedAt: '2026-08-05T12:00:00.000Z',
      },
      {
        id: 'individual-output',
        kind: 'individual',
        sourceId: 'media-1',
        label: 'One',
        included: true,
        addedAt: '2026-08-05T12:00:00.000Z',
      },
    ],
    notes: '',
    workingAngle: '',
    captionSeeds: 'Caption seed',
    outputAngles: '',
  };
}

function receipt() {
  return {
    deliverableId: 'idea-packet-main',
    postId: '12345678-1234-1234-1234-123456789012',
    postUrl: 'https://www.notion.so/12345678123412341234123456789012',
    createUrl: 'https://create.justlikekatie.com/compose?postId=12345678-1234-1234-1234-123456789012',
    status: 'Draft',
    sourceVersion: 1,
    workflow: 'packet',
    disposition: 'created',
    packetReceipt: { packetId: 'packet-1', deliverableId: 'idea-packet-main', accepted: true },
    mediaSyncState: 'synced',
    warnings: [],
  };
}

test('sends single grid, single image, and mixed outputs in primary tray order', async () => {
  for (const included of [['grid-output'], ['individual-output'], ['individual-output', 'grid-output']]) {
    const current = packet();
    current.outputs = included.map(id => current.outputs.find(output => output.id === id)!);
    const rendered: RenderedPacketOutput[] = current.outputs.map(output => ({
      output,
      blob: new Blob([output.id], { type: 'image/png' }),
      filename: `${output.id}.png`,
    }));
    let observed: Record<string, unknown> | undefined;
    const result = await sendIdeaPacketToCreate(current, rendered, async (_url, init) => {
      assert.equal(new Headers(init?.headers).get('Content-Type'), 'application/json');
      observed = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ receipt: receipt() }), { status: 201 });
    });

    assert.deepEqual(
      (observed!.outputs as Array<{ outputId: string }>).map(output => output.outputId),
      included,
    );
    assert.deepEqual(
      (observed!.outputs as Array<Record<string, unknown>>).map(output => ({
        renderContract: output.renderContract,
        renderVersion: output.renderVersion,
        width: output.width,
        height: output.height,
      })),
      included.map(() => ({
        renderContract: 'fandom.idea-packet-output.v1',
        renderVersion: 1,
        width: 1080,
        height: 1350,
      })),
    );
    assert.equal(result.createUrl, receipt().createUrl);
  }
});

test('selects the exact individual media for rendering', () => {
  const current = packet();
  current.media.unshift({
    ...current.media[0],
    id: 'different-media',
    imageUrl: 'https://images.example/different.jpg',
  });

  const input = packetIndividualRenderInput(current, current.media[1]);
  assert.equal(input.imageUrl, 'https://images.example/one.jpg');
  assert.equal(input.date, '2026-08-05');
});

test('uses the Middle-earth render contract and text fingerprint for meme outputs', async () => {
  const current = packet();
  current.outputs = [{
    id: 'meme-output',
    kind: 'meme',
    sourceId: 'media-1',
    label: 'Meme: Release fellowship',
    included: true,
    addedAt: '2026-08-05T12:00:00.000Z',
    textFingerprint: 'meme\u0000Release fellowship\u0000One more deploy\u0000\u0000Deadpan\u0000Editorial caption',
  }];
  let observed: Record<string, unknown> | undefined;
  await sendIdeaPacketToCreate(current, [{
    output: current.outputs[0],
    blob: new Blob(['png'], { type: 'image/png' }),
    filename: 'meme-output.png',
  }], async (_url, init) => {
    observed = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ receipt: receipt() }), { status: 201 });
  });

  const output = (observed!.outputs as Array<Record<string, unknown>>)[0];
  assert.equal(output.renderContract, 'fandom.middle-earth-output.v1');
  assert.equal(output.renderVersion, 1);
  assert.equal(output.width, 1080);
  assert.equal(output.height, 1350);
  assert.equal(output.textFingerprint, current.outputs[0].textFingerprint);
});

test('rejects the whole grid when any persisted source image fails to load', async () => {
  const current = packet();
  current.sourceCards.push({
    ...current.sourceCards[0],
    id: 'media-2',
    title: 'Broken source',
    imageUrl: 'https://images.example/broken.jpg',
  });
  let handoffCalls = 0;
  await assert.rejects(
    completeIdeaPacketHandoff(
      current,
      async () => {
        await loadRequiredGridImages(current, async (_url, label) => {
          if (label === 'Broken source') throw new Error('Could not load "Broken source" for the rendered grid.');
          return { loaded: true };
        });
        return [];
      },
      async () => {
        handoffCalls += 1;
        return receipt();
      },
    ),
    /Broken source/,
  );
  assert.equal(handoffCalls, 0);
});

test('surfaces partial handoff failures and rejects untrusted CREATE deep links', async () => {
  const current = packet();
  const rendered = current.outputs.map(output => ({
    output,
    blob: new Blob(['png'], { type: 'image/png' }),
    filename: `${output.id}.png`,
  }));
  await assert.rejects(
    sendIdeaPacketToCreate(current, rendered, async () => new Response(JSON.stringify({
      error: 'MEDIA unavailable',
      stage: 'media',
      details: { registered: [{ assetId: 'asset-1' }] },
    }), { status: 502 })),
    /MEDIA unavailable \(media stage\)/,
  );
  await assert.rejects(
    sendIdeaPacketToCreate(current, rendered, async () => new Response(JSON.stringify({
      receipt: { ...receipt(), createUrl: 'https://attacker.example/compose?postId=x' },
    }), { status: 201 })),
    /invalid receipt/,
  );
});
