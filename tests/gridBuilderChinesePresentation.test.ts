import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  displayRationaleBrief,
  gridRecordFromProposal,
  lensOptions,
  proposeGrid,
  type BuilderCard,
} from '../src/utils/gridBuilder.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function card(index: number, family: string): BuilderCard {
  return {
    key: `https://images.example/${family}-${index}.jpg`,
    imageUrl: `https://images.example/${family}-${index}.jpg`,
    sourceUrl: `https://source.example/${family}/${index}`,
    title: `Editorial source frame ${index}`,
    publisher: `Publisher ${family}`,
    actor: '刘学义',
    actorEn: 'Liu Xueyi',
    actorId: 'liu-xueyi',
    actorAccentColor: '#c9a96e',
    vibe: index % 2 === 0 ? '月下公子' : '红衣赴约',
    vibeEn: index % 2 === 0 ? 'Moonlit Gentleman' : 'Red-Robed Rendezvous',
    vibeEmoji: '✨',
    vibeSubtitle: '月色之下，仍然无辜',
    vibeSubtitleEn: 'Moonlit, apparently innocent',
    batchKey: `batch-${family}`,
    capturedDate: `2026-09-${String(index + 1).padStart(2, '0')}`,
    resultId: `${family}-${index}`,
    origin: 'saved-card',
    familyId: family,
    familyLabel: `Editorial family ${family}`,
    familyEvidence: 'batch',
  };
}

test('Chinese lens labels change presentation, not saved actor/vibe lens values', () => {
  const pool = Array.from({ length: 9 }, (_, index) => card(index, `family-${index % 3}`));
  const english = lensOptions(pool, 'en');
  const chinese = lensOptions(pool, 'zh-CN');

  assert.deepEqual(chinese.actors.map(({ value, count }) => ({ value, count })),
    english.actors.map(({ value, count }) => ({ value, count })));
  assert.deepEqual(chinese.vibes.map(({ value, count }) => ({ value, count })),
    english.vibes.map(({ value, count }) => ({ value, count })));
  assert.match(chinese.actors[0].label, /刘学义.*英文原文：Liu Xueyi/);
  assert.match(chinese.vibes[0].label, /英文原文：/);
  assert.equal(chinese.actors[0].value, pool[0].actor);
  assert.equal(chinese.vibes[0].value, pool[0].vibeEn);
});

test('Chinese brief is display-only and preserves saved grid identity, original content, and provenance', () => {
  const pool = Array.from({ length: 9 }, (_, index) => card(index, `family-${index % 3}`));
  const proposal = proposeGrid(pool, { actor: '刘学义' }, 'compiled');
  const rationaleBefore = structuredClone(proposal.rationale);
  const date = new Date('2026-09-24T12:00:00.000Z');
  const provenance = { kind: 'edition' as const, editionDate: '2026-09-23' };
  const originalGrid = gridRecordFromProposal(proposal.slots, proposal.rationale, date, undefined, provenance);

  const englishBrief = displayRationaleBrief(proposal.rationale, 'en');
  const chineseBrief = displayRationaleBrief(proposal.rationale, 'zh-CN');
  const gridAfterPresentation = gridRecordFromProposal(proposal.slots, proposal.rationale, date, undefined, provenance);

  assert.match(englishBrief, /Editorial contract:/);
  assert.match(chineseBrief, /编辑约定：/);
  assert.match(chineseBrief, /英文原文：/);
  assert.deepEqual(proposal.rationale, rationaleBefore);
  assert.equal(gridAfterPresentation.id, originalGrid.id);
  assert.equal(gridAfterPresentation.generationPrompt, originalGrid.generationPrompt);
  assert.equal(gridAfterPresentation.actor, originalGrid.actor);
  assert.equal(gridAfterPresentation.actorEn, originalGrid.actorEn);
  assert.equal(gridAfterPresentation.vibe, originalGrid.vibe);
  assert.equal(gridAfterPresentation.vibeEn, originalGrid.vibeEn);
  assert.deepEqual(gridAfterPresentation.sourceProvenance, provenance);
  assert.deepEqual(gridAfterPresentation.images.map(({ resultId, sourceUrl, title }) => ({ resultId, sourceUrl, title })),
    originalGrid.images.map(({ resultId, sourceUrl, title }) => ({ resultId, sourceUrl, title })));
});

test('changing locale is not a Grid Builder source reset and leaves its in-memory draft alone', () => {
  const source = readFileSync(path.join(__dirname, '../src/components/GridBuilder/GridBuilder.tsx'), 'utf8');
  const sourceLoadEffect = source.match(
    /useEffect\(\(\) => \{\s*let cancelled = false;\s*(?:\/\/[^\n]*\n\s*)*if \(!isPublicArchiveSource\) setPool\(null\);\s*setLoadError\(''\);\s*setLens\(\{\}\);\s*setProposal\(null\);[\s\S]*?\}, \[([^\]]+)\]\);/,
  );

  assert.ok(sourceLoadEffect, 'the Builder inventory reset effect remains identifiable');
  assert.doesNotMatch(sourceLoadEffect[1], /\blocale\b/, 'locale switching must not reload inventory or clear the draft');
  assert.match(source, /const \[proposal, setProposal\] = useState<GridProposal \| null>\(null\)/);
  assert.match(source, /const \[swapSlot, setSwapSlot\] = useState<number \| null>\(null\)/);
});