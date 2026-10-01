import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GridBuilder } from '../src/components/GridBuilder/GridBuilder';

const mocks = vi.hoisted(() => ({
  getGrids: vi.fn(),
  saveGrid: vi.fn(),
  prepare: vi.fn(),
  download: vi.fn(),
  onExported: vi.fn(),
}));

const cards = Array.from({ length: 9 }, (_, index) => ({
  key: `card-${index}`,
  title: `Image ${index}`,
  imageUrl: `https://example.test/${index}.png`,
  actor: 'Fixture actor',
  familyId: 'family',
  familyLabel: 'Family',
}));
const rationale = {
  compositionSize: 9,
  editorialMode: 'compiled',
  manualSwaps: [],
  slotReasons: cards.map(() => 'Selected'),
};

vi.mock('../src/utils/collectionDB', () => ({
  dbGetVisibleCardsByScope: vi.fn(async () => []),
  dbGetVisibleGrids: mocks.getGrids,
  dbSaveGrid: mocks.saveGrid,
}));
vi.mock('../src/utils/gridBuilder', () => ({
  buildVibeAtlasPool: vi.fn(() => cards),
  lensOptions: vi.fn(() => ({ actors: [], vibes: [], families: [] })),
  applyLens: vi.fn((pool) => pool),
  proposeGrid: vi.fn(() => ({ slots: cards, alternates: [], rationale })),
  gridRecordFromProposal: vi.fn(() => ({ id: 'grid-1', images: [] })),
  rationaleBrief: vi.fn(() => 'Fixture rationale'),
  actorPackIdForLens: vi.fn(() => ''),
}));
vi.mock('../src/utils/collectionHistoryModel', () => ({
  starDataFromCollectionGrid: vi.fn(() => ({ chosen: [] })),
}));
vi.mock('../src/utils/exportCanvas', () => ({
  prepareShareCard: mocks.prepare,
  saveShareCard: mocks.download,
  buildExportPayload: vi.fn(() => ({ chosen: [] })),
  classifyEditionTier: vi.fn(() => 'standard'),
}));
vi.mock('../src/utils/gridExportLog', () => ({
  gridExportEventFromRecord: vi.fn(() => ({})),
  logGridExport: vi.fn(),
  uploadExportedCard: vi.fn(async () => false),
}));
vi.mock('../src/utils/membership', () => ({ logMembershipEvent: vi.fn() }));
vi.mock('../src/utils/collectorBenefits', () => ({
  collectorBenefits: vi.fn(() => ({ canvasAllowance: 4 })),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function openBuilder(saved: boolean) {
  mocks.getGrids.mockResolvedValue([]);
  render(<GridBuilder onExported={mocks.onExported} sourceKind="daily" sourcePool={cards as never} />);
  await screen.findByRole('button', { name: /Propose Compiled 3×3/ });
  fireEvent.click(screen.getByRole('button', { name: /Propose Compiled 3×3/ }));
  if (saved) {
    fireEvent.click(screen.getByRole('button', { name: /Save grid/ }));
    await screen.findByRole('button', { name: /Saved/ });
    mocks.onExported.mockClear();
  }
}

function rawButton() {
  fireEvent.click(screen.getByRole('button', { name: 'Handoff Publishing Grid' }));
  return screen.getByRole('button', { name: 'Download PNG' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saveGrid.mockResolvedValue(undefined);
  mocks.prepare.mockImplementation(async () => ({
    objectUrl: 'blob:fixture',
    file: new File(['png'], 'fixture.png', { type: 'image/png' }),
    fileName: 'fixture.png',
    tier: 'raw',
  }));
  mocks.download.mockResolvedValue('Downloaded');
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('GridBuilder export navigation', () => {
  it.each([false, true])('keeps a prepared RedNote handoff open (saved=%s)', async saved => {
    await openBuilder(saved);
    fireEvent.click(screen.getByRole('button', { name: 'Handoff Publishing Grid' }));
    fireEvent.click(screen.getByRole('button', { name: '1. Prepare RedNote Handoff' }));
    await screen.findByText('Handoff prepared.');
    expect(screen.getByRole('button', { name: '2a. Share to Device' })).toBeTruthy();
    expect(mocks.onExported).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Save to collection/ })).toBeNull();
  });

  it.each(['raw', 'full'] as const)('navigates saved %s downloads only after success', async action => {
    await openBuilder(true);
    const pending = deferred<never>();
    if (action === 'raw') mocks.prepare.mockReturnValueOnce(pending.promise);
    else mocks.download.mockReturnValueOnce(pending.promise);
    fireEvent.click(action === 'raw'
      ? rawButton()
      : screen.getByRole('button', { name: /Export square PNG/ }));
    expect(mocks.onExported).not.toHaveBeenCalled();
    pending.resolve(action === 'raw'
      ? { objectUrl: 'blob:fixture', file: new File(['png'], 'fixture.png'), fileName: 'fixture.png', tier: 'raw' } as never
      : 'Downloaded' as never);
    await waitFor(() => expect(mocks.onExported).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: /Save to collection/ })).toBeNull();
  });

  it.each(['raw', 'full'] as const)('does not navigate after a failed saved %s download', async action => {
    await openBuilder(true);
    if (action === 'raw') mocks.prepare.mockRejectedValueOnce(new Error('Render failed'));
    else mocks.download.mockRejectedValueOnce(new Error('Render failed'));
    fireEvent.click(action === 'raw'
      ? rawButton()
      : screen.getByRole('button', { name: /Export square PNG/ }));
    await screen.findByText('Render failed');
    expect(mocks.onExported).not.toHaveBeenCalled();
  });

  it.each(['raw', 'full'] as const)('nudges unsaved %s downloads, then navigates only after save', async action => {
    await openBuilder(false);
    fireEvent.click(action === 'raw'
      ? rawButton()
      : screen.getByRole('button', { name: /Export square PNG/ }));
    const nudge = await screen.findByRole('button', { name: /Save to collection/ });
    expect(mocks.onExported).not.toHaveBeenCalled();
    const saving = deferred<void>();
    mocks.saveGrid.mockReturnValueOnce(saving.promise);
    fireEvent.click(nudge);
    expect(mocks.onExported).not.toHaveBeenCalled();
    saving.resolve();
    await waitFor(() => expect(mocks.onExported).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: /Save to collection/ })).toBeNull();
  });

  it('does not navigate when an unsaved download is followed by a failed save', async () => {
    await openBuilder(false);
    fireEvent.click(screen.getByRole('button', { name: /Export square PNG/ }));
    mocks.saveGrid.mockRejectedValueOnce(new Error('Cannot save'));
    fireEvent.click(await screen.findByRole('button', { name: /Save to collection/ }));
    await screen.findByText(/Cannot save/);
    expect(mocks.onExported).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Save to collection/ })).toBeTruthy();
  });
});