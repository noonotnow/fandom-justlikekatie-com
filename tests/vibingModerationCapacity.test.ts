import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import React, { createElement } from 'react';
import { act, create } from 'react-test-renderer';

register('./css-module-loader.mjs', import.meta.url);

// Standalone tsx can use classic JSX; keep that compatibility in the test
// environment rather than adding an unused import to the automatic-JSX app.
const originalReact = Object.getOwnPropertyDescriptor(globalThis, 'React');
before(() => {
  Object.defineProperty(globalThis, 'React', { value: React, configurable: true });
});
after(() => {
  if (originalReact) Object.defineProperty(globalThis, 'React', originalReact);
  else Reflect.deleteProperty(globalThis, 'React');
});

test('admin discussion capacity warns for total and protected replies, then refreshes after moderation', async () => {
  const { VibingModeration } = await import('../src/components/FandomAdmin/VibingModeration');
  const originalFetch = globalThis.fetch;
  const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  let capacity = { total: 1600, approved: 100, limit: 2000, warningAt: 1600 };
  let reads = 0;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = (async (url, options) => {
    if (String(url).includes('moderation-summary')) return Response.json({ topics: [
      { discussionId: 'against-the-current-episode-21', pending: 1, reported: 0 },
      { discussionId: 'against-the-current-episodes-22-25', pending: 0, reported: 0 },
    ] });
    if (options?.method === 'POST') {
      capacity = { ...capacity, approved: 1600 };
      return Response.json({ ok: true });
    }
    reads++;
    return Response.json({
      entries: [{
        id: 'pending-1', text: 'Private submission.', status: 'pending',
        safeThroughEpisode: 21, submittedAt: '2026-09-27T12:00:00.000Z',
      }],
      capacity,
    });
  }) as typeof fetch;
  try {
    let panel: ReturnType<typeof create>;
    await act(async () => { panel = create(createElement(VibingModeration)); });
    let markup = JSON.stringify(panel!.toJSON());
    assert.match(markup, /"1600"," of ","2000"," records/);
    assert.match(markup, /"100"," approved replies protected/);
    assert.match(markup, /Preview cleanup for eligible records/);
    assert.doesNotMatch(markup, /Plan a reviewed storage expansion/);

    await act(async () => {
      const approve = panel!.root.findAllByType('button')
        .find(button => button.props.children === 'Approve');
      assert.ok(approve);
      await approve.props.onClick();
    });
    markup = JSON.stringify(panel!.toJSON());
    assert.match(markup, /"1600"," approved replies protected/);
    assert.match(markup, /Plan a reviewed storage expansion/);
    assert.equal(reads, 2);
    await act(async () => { panel!.unmount(); });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  }
});

test('admin discussion capacity identifies full approved archives without showing a cleanup escape', async () => {
  const { VibingModeration } = await import('../src/components/FandomAdmin/VibingModeration');
  const originalFetch = globalThis.fetch;
  const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = (async url => String(url).includes('moderation-summary') ? Response.json({ topics: [
    { discussionId: 'against-the-current-episode-21', pending: 0, reported: 0 },
    { discussionId: 'against-the-current-episodes-22-25', pending: 0, reported: 0 },
  ] }) : Response.json({
    entries: [],
    capacity: { total: 2000, approved: 2000, limit: 2000, warningAt: 1600 },
  })) as typeof fetch;
  try {
    let panel: ReturnType<typeof create>;
    await act(async () => { panel = create(createElement(VibingModeration)); });
    const markup = JSON.stringify(panel!.toJSON());
    assert.match(markup, /Approved replies fill the archive/);
    assert.match(markup, /New submissions are paused until a reviewed storage expansion/);
    assert.doesNotMatch(markup, /private-reporter|private-owner/);
    await act(async () => { panel!.unmount(); });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  }
});

test('selector counts refresh after moderation and failed aggregate reads never display stale zeros', async () => {
  const { VibingModeration } = await import('../src/components/FandomAdmin/VibingModeration');
  const originalFetch = globalThis.fetch;
  const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let pending = 2;
  let failSummary = false;
  let summaryReads = 0;
  globalThis.fetch = (async (url, options) => {
    if (String(url).includes('moderation-summary')) {
      summaryReads++;
      if (failSummary) return Response.json({ error: 'Archive unavailable.' }, { status: 503 });
      return Response.json({ topics: [
        { discussionId: 'against-the-current-episode-21', pending, reported: 1 },
        { discussionId: 'against-the-current-episodes-22-25', pending: 0, reported: 2 },
      ] });
    }
    if (options?.method === 'POST') {
      pending--;
      failSummary = true;
      return Response.json({ ok: true });
    }
    return Response.json({
      entries: pending ? [{
        id: 'pending-1', text: 'Private submission.', status: 'pending',
        safeThroughEpisode: 21, submittedAt: '2026-09-27T12:00:00.000Z',
      }] : [],
      capacity: { total: pending, approved: 0, limit: 2000, warningAt: 1600 },
    });
  }) as typeof fetch;
  try {
    let panel: ReturnType<typeof create>;
    await act(async () => { panel = create(createElement(VibingModeration)); });
    let options = panel!.root.findByType('select').findAllByType('option').map(option => option.props.children.join(''));
    assert.match(JSON.stringify(options), /Episode 21 · 2 pending · 1 reported/);
    assert.match(JSON.stringify(options), /Episodes 22–25 · 0 pending · 2 reported/);
    await act(async () => {
      const approve = panel!.root.findAllByType('button').find(button => button.props.children === 'Approve');
      assert.ok(approve);
      await approve.props.onClick();
    });
    options = panel!.root.findByType('select').findAllByType('option').map(option => option.props.children.join(''));
    assert.doesNotMatch(JSON.stringify(options), /pending ·/);
    assert.match(JSON.stringify(panel!.toJSON()), /Discussion counts unavailable:.*Archive unavailable/);
    failSummary = false;
    await act(async () => {
      const retry = panel!.root.findAllByType('button').find(button => button.props.children === 'Retry counts');
      assert.ok(retry);
      await retry.props.onClick();
    });
    assert.equal(summaryReads, 3);
    options = panel!.root.findByType('select').findAllByType('option').map(option => option.props.children.join(''));
    assert.match(JSON.stringify(options), /Episode 21 · 1 pending · 1 reported/);
    await act(async () => { panel!.unmount(); });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  }
});