import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLECTOR_ADDITIONAL_CANVASES,
  COLLECTOR_CANVAS_ALLOWANCE,
  FREE_CANVAS_ALLOWANCE,
  collectorBenefits,
} from '../src/utils/collectorBenefits.ts';

test('free Collector workflow keeps one local square canvas and no locked palette', () => {
  const benefits = collectorBenefits(false);
  assert.equal(benefits.canvasAllowance, FREE_CANVAS_ALLOWANCE);
  assert.equal(benefits.additionalCanvases, 0);
  assert.equal(benefits.crossDevicePersistence, false);
  assert.deepEqual(benefits.palettes, []);
});

test('active Fandom membership receives the complete Collector allowance', () => {
  const benefits = collectorBenefits(true);
  assert.equal(benefits.canvasAllowance, COLLECTOR_CANVAS_ALLOWANCE);
  assert.equal(benefits.additionalCanvases, COLLECTOR_ADDITIONAL_CANVASES);
  assert.equal(benefits.crossDevicePersistence, true);
  assert.deepEqual(benefits.palettes.map(palette => palette.id), ['moonlit-ink']);
});