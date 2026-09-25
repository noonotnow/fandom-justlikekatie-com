import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMasterExportManifest, EXPORT_CONTRACTS } from '../src/utils/exportCanvas.ts';
import { uploadExportedCard } from '../src/utils/gridExportLog.ts';

test('standard and master exports publish explicit square sRGB contracts', () => {
  assert.deepEqual(
    { width: EXPORT_CONTRACTS.standard.width, height: EXPORT_CONTRACTS.standard.height, colorProfile: EXPORT_CONTRACTS.standard.colorProfile },
    { width: 1080, height: 1080, colorProfile: 'sRGB' },
  );
  assert.deepEqual(
    { width: EXPORT_CONTRACTS.master.width, height: EXPORT_CONTRACTS.master.height, colorProfile: EXPORT_CONTRACTS.master.colorProfile },
    { width: 2160, height: 2160, colorProfile: 'sRGB' },
  );
});

test('master manifest preserves only permitted MEDIA provenance', () => {
  const assets = Array.from({ length: 9 }, (_, index) => ({
    assetId: `11111111-2222-4${String(index).padStart(3, '0')}-8444-555555555555`,
    checksum: 'a'.repeat(64),
    deliveryUrl: `https://media.example.test/assets/${index}`,
    permitted: true as const,
  }));
  const manifest = buildMasterExportManifest('grid-1', 'board-hash-v1', assets, '2026-08-17T12:00:00.000Z');
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.contractVersion, 1);
  assert.equal(manifest.variant, 'master');
  assert.equal(manifest.colorProfile, 'sRGB');
  assert.equal(manifest.assets.length, 9);
  assert.throws(
    () => buildMasterExportManifest('grid-1', 'board-hash-v1', assets.slice(0, 8)),
    /nine permitted MEDIA assets/,
  );
});

test('master upload carries its provenance manifest to server validation', async () => {
  const assets = Array.from({ length: 9 }, (_, index) => ({
    assetId: `11111111-2222-4${String(index).padStart(3, '0')}-8444-555555555555`,
    checksum: 'a'.repeat(64),
    deliveryUrl: `https://media.example.test/assets/${index}`,
    permitted: true as const,
  }));
  const manifest = buildMasterExportManifest('grid-1', 'board-hash-v1', assets);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    assert.equal(new Headers(init?.headers).get('X-Export-Manifest'), JSON.stringify(manifest));
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  try {
    assert.equal(
      await uploadExportedCard('grid-1', '11111111-2222-4333-8444-555555555555', new Blob(['png']), 'master', 'standard', manifest),
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});