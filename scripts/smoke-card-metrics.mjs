#!/usr/bin/env node
// Post-deploy smoke test for /api/card-metrics.
//
// The queries in this feature are unit-tested and compile to valid SQL, but
// until a deploy is published there is no database branch to run them against.
// This script is the first real exercise: it writes one of each event, reads
// every view back, and confirms the writes actually landed.
//
//   node scripts/smoke-card-metrics.mjs https://<deploy-url>
//
// Writes real rows. Point it at a deploy preview rather than production if you
// would rather not seed the production baseline with synthetic cards — the ids
// it uses are prefixed `smoke-` so they are easy to spot either way.

const baseUrl = process.argv[2]?.replace(/\/$/, '');
if (!baseUrl) {
  console.error('Usage: node scripts/smoke-card-metrics.mjs https://<deploy-url>');
  process.exit(2);
}

const endpoint = `${baseUrl}/api/card-metrics`;
const runId = `smoke-${Date.now()}`;
const imageCardId = `${runId}-image`;
const boardCardId = `2026-01-01::${runId}-actor`;

let failures = 0;

function check(label, condition, detail) {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function post(body) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function get(params) {
  const response = await fetch(`${endpoint}?${new URLSearchParams(params)}`);
  return { status: response.status, body: await response.json().catch(() => null) };
}

console.log(`\nSmoke testing ${endpoint}`);
console.log(`Run id: ${runId}\n`);

// 1-5. Write one of each event a user can actually trigger.
console.log('Writing events');
const writes = [
  { event: 'export', cardId: imageCardId, actor: 'Smoke Actor', vibe: 'Smoke Vibe' },
  { event: 'legendary', cardId: imageCardId, actor: 'Smoke Actor', vibe: 'Smoke Vibe' },
  { event: 'misprint', cardId: imageCardId, actor: 'Smoke Actor', vibe: 'Smoke Vibe' },
  { event: 'collection_save', cardId: imageCardId, actor: 'Smoke Actor', vibe: 'Smoke Vibe' },
  { event: 'plan_add', cardId: imageCardId, actor: 'Smoke Actor', vibe: 'Smoke Vibe' },
  { event: 'legendary', cardId: boardCardId, subjectType: 'board', actor: 'Smoke Actor' },
];
for (const write of writes) {
  const result = await post({ subjectType: 'image', capturedDate: '2026-01-01', ...write });
  check(
    `POST ${write.event} (${write.subjectType ?? 'image'})`,
    result.status === 202,
    `got HTTP ${result.status} ${JSON.stringify(result.body)}`,
  );
}

// A rejected payload must be visibly rejected, not quietly accepted. This is
// the failure mode that hid the original bug: fetch resolves on a 4xx, so an
// endpoint that accepts junk looks identical to one that works.
console.log('\nRejecting bad payloads');
const badEvent = await post({ event: 'telepathy', cardId: imageCardId });
check('unknown event is rejected', badEvent.status === 400, `got HTTP ${badEvent.status}`);
const noCard = await post({ event: 'export' });
check('missing cardId is rejected', noCard.status === 400, `got HTTP ${noCard.status}`);

// 6-7. Read every view back and confirm the writes are visible.
console.log('\nReading views');
const health = await get({ view: 'health' });
check('health responds 200', health.status === 200, `got HTTP ${health.status}`);
check('health reports receiving', health.body?.receiving === true, JSON.stringify(health.body?.totals));
check('health counts today', (health.body?.totals?.last24h ?? 0) >= writes.length, JSON.stringify(health.body?.totals));
for (const event of ['export', 'legendary', 'misprint', 'collection_save', 'plan_add']) {
  const row = health.body?.byEvent?.find((entry) => entry.event === event);
  check(`health shows ${event} in the last 24h`, (row?.last24h ?? 0) >= 1, JSON.stringify(row));
}

const card = await get({ view: 'card', card: imageCardId });
check('card view responds 200', card.status === 200, `got HTTP ${card.status}`);
check('card totals count the export', card.body?.totals?.export >= 1, JSON.stringify(card.body?.totals));
check('card totals count the legendary mark', card.body?.totals?.legendary >= 1, JSON.stringify(card.body?.totals));
check('card series is zero-filled to the window', card.body?.series?.length === 30, `length ${card.body?.series?.length}`);
check(
  'card series records today',
  card.body?.series?.[card.body.series.length - 1]?.count >= 1,
  JSON.stringify(card.body?.series?.slice(-1)),
);

const trends = await get({ view: 'trends', event: 'export', days: '7' });
check('trends responds 200', trends.status === 200, `got HTTP ${trends.status}`);
check('trends returns one point per day', trends.body?.series?.length === 7, `length ${trends.body?.series?.length}`);
check(
  'trends counts today',
  trends.body?.series?.[trends.body.series.length - 1]?.count >= 1,
  JSON.stringify(trends.body?.series?.slice(-1)),
);

const top = await get({ view: 'top', event: 'export', days: '7', limit: '10' });
check('top responds 200', top.status === 200, `got HTTP ${top.status}`);
check(
  'top includes the smoke card',
  top.body?.cards?.some((entry) => entry.cardId === imageCardId),
  JSON.stringify(top.body?.cards?.map((entry) => entry.cardId)),
);

// 8. Boards must not pollute the image leaderboard, and vice versa.
const topBoards = await get({ view: 'top', event: 'legendary', subjectType: 'board', days: '7' });
check('board leaderboard responds 200', topBoards.status === 200, `got HTTP ${topBoards.status}`);
check(
  'board leaderboard includes the smoke board',
  topBoards.body?.cards?.some((entry) => entry.cardId === boardCardId),
  JSON.stringify(topBoards.body?.cards?.map((entry) => entry.cardId)),
);
check(
  'image leaderboard excludes boards',
  !top.body?.cards?.some((entry) => entry.cardId === boardCardId),
  'a board appeared in the default (image) top view',
);

// Cleared toggles are a client-side rule (see tierEventFor), so the only thing
// verifiable here is that the endpoint has no way to express one: there is no
// "cleared" event to send. Anything that arrives is a deliberate set.
console.log('\nToggle semantics');
const clearAttempt = await post({ event: null, cardId: imageCardId });
check('there is no event for a cleared tier', clearAttempt.status === 400, `got HTTP ${clearAttempt.status}`);
console.log('  note  clearing a tier is verified by tests/cardMetrics.test.ts (tierEventFor)');

console.log(
  failures === 0
    ? `\nAll checks passed. Pipe is alive.\nSynthetic rows are under cardId prefix "${runId}".\n`
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
