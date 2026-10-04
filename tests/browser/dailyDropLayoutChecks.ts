import assert from 'node:assert/strict';
import type { Locator, Page } from '@playwright/test';

const TOLERANCE = 0.5; // Allow subpixel rounding, not visible overlap.
type Box = { x: number; y: number; width: number; height: number };

async function renderedBox(locator: Locator, label: string): Promise<Box> {
  const box = await locator.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, `${label} must have a rendered bounding box`);
  return box;
}

async function visibleBoxes(locator: Locator, label: string): Promise<Box[]> {
  const boxes: Box[] = [];
  for (const element of await locator.all()) {
    if (await element.isVisible()) boxes.push(await renderedBox(element, label));
  }
  return boxes;
}

function below(upper: Box, lower: Box, label: string) {
  assert.ok(lower.y >= upper.y + upper.height - TOLERANCE,
    `${label}: lower top ${lower.y} must be below upper bottom ${upper.y + upper.height}`);
}

function contains(outer: Box, inner: Box, label: string) {
  assert.ok(inner.x >= outer.x - TOLERANCE && inner.y >= outer.y - TOLERANCE
    && inner.x + inner.width <= outer.x + outer.width + TOLERANCE
    && inner.y + inner.height <= outer.y + outer.height + TOLERANCE,
  `${label}: rendered content must stay inside its section`);
}

// Shared by fixture tests and the read-only hosted checker. Viewport-relative
// boxes remain comparable below the fold; do not scroll each element separately.
export async function assertDailyDropRenderedLayout(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const drop = page.locator('.daily-drop');
  const actions = drop.locator('.daily-actions');
  const discovery = page.locator('.daily-released-pack');
  const snapshot = discovery.locator('.daily-released-pack__snapshot');
  const boxes = {
    drop: await renderedBox(drop, 'Complete Drop'),
    context: await renderedBox(drop.locator('.atlas-edition__meta'), 'Daily context'),
    grid: await renderedBox(drop.locator('.daily-grid'), 'Interactive grid'),
    actions: await renderedBox(actions, 'Whole-board actions'),
    discovery: await renderedBox(discovery, 'Related-pack discovery'),
  };
  below(boxes.context, boxes.grid, 'Daily context must precede the interactive grid');
  below(boxes.grid, boxes.actions, 'Whole-board actions must follow the interactive grid');
  // Check children as well: transforms/positioning can escape a correctly placed
  // parent without changing its box. Closed details content is not rendered.
  const controls = await visibleBoxes(actions.locator(
    '.daily-actions__classification, .daily-actions__primary, button, select, summary',
  ), 'Whole-board control');
  assert.ok(controls.length > 0, 'Whole-board controls must be rendered');
  for (const box of [boxes.context, boxes.grid, boxes.actions, ...controls]) {
    contains(boxes.drop, box, 'Complete Drop');
  }
  for (const control of controls) {
    below(boxes.grid, control, 'Whole-board control must follow the interactive grid');
  }
  const discoveryContent = await visibleBoxes(discovery.locator(
    '.daily-released-pack__intro, .daily-released-pack__access, a',
  ), 'Discovery content');
  for (const box of [boxes.discovery, ...discoveryContent]) {
    below(boxes.drop, box, 'Related-pack discovery must follow the complete Drop');
  }
  let snapshotBox: Box | null = null;
  if (await snapshot.count()) {
    assert.equal(await snapshot.evaluate(el => (el as HTMLDetailsElement).open), false,
      'First-grid snapshot must be collapsed for layout verification');
    snapshotBox = await renderedBox(snapshot, 'Collapsed snapshot');
    const summaryBox = await renderedBox(snapshot.locator('summary'), 'Collapsed snapshot summary');
    for (const box of [snapshotBox, summaryBox]) {
      below(boxes.drop, box, 'Collapsed snapshot must follow the complete Drop');
      for (const control of [boxes.actions, ...controls]) {
        below(control, box, 'Collapsed snapshot must follow every whole-board control');
      }
    }
  }
  return { ...boxes, controls, discoveryContent, snapshot: snapshotBox };
}