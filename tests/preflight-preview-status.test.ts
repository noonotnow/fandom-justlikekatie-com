import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchPublicPreviewState } from '../src/components/FandomAdmin/preflightPreviewStatus';

const preview = (actorId = 'liu-xueyi', vibeIdx = 1, count = 3) => ({
  kind: 'vibe-atlas-preflight-three-card-preview',
  actor: { id: actorId },
  vibeIdx,
  cards: Array.from({ length: count }, (_, position) => ({ position })),
});

test('live check targets one pair and requires its actor and exactly three cards', async () => {
  let requested = '';
  const fetchImpl = (async (url: string, options: RequestInit) => {
    requested = String(url);
    assert.equal(options.cache, 'no-store');
    return Response.json(preview());
  }) as typeof fetch;
  assert.equal(await fetchPublicPreviewState('liu-xueyi', 1, fetchImpl), 'live');
  assert.match(requested, /actorId=liu-xueyi&vibeIdx=1$/);

  for (const body of [preview('dylan-wang'), preview('liu-xueyi', 2), preview('liu-xueyi', 1, 9)]) {
    assert.equal(await fetchPublicPreviewState('liu-xueyi', 1, async () => Response.json(body)), 'unavailable');
  }
});

test('live check distinguishes unpublished and unavailable without claiming publication', async () => {
  assert.equal(await fetchPublicPreviewState('liu-xueyi', 1,
    async () => Response.json({ status: 'unpublished' }, { status: 404 })), 'unpublished');
  assert.equal(await fetchPublicPreviewState('liu-xueyi', 1,
    async () => Response.json({ status: 'unavailable' }, { status: 503 })), 'unavailable');
  assert.equal(await fetchPublicPreviewState('liu-xueyi', 1,
    async () => { throw new Error('private network detail'); }), 'unavailable');
});