import type { GridItemData } from '../types';
import type { StarOfDayData } from '../hooks/useStarOfDay';
import type { CardRecord, GridRecord } from './collectionDB';

export type IdeaPacketState = 'collecting' | 'media_compiled';
export type PacketOutputKind = 'grid' | 'individual';

export interface PacketMedia {
  id: string;
  imageUrl: string;
  sourceUrl: string;
  title: string;
  publisher?: string;
  resultId: string;
  batchKey?: string;
  gridPosition?: number;
  addedAt: string;
}

export interface PacketSourceCard {
  id: string;
  order: number;
  imageUrl: string;
  sourceUrl: string;
  title: string;
  creator?: string;
  capturedAt: string;
  resultId: string;
  provenance: string;
}

export interface PacketOutput {
  id: string;
  kind: PacketOutputKind;
  sourceId: string;
  label: string;
  included: boolean;
  addedAt: string;
}

export type PacketGrid = Omit<
  GridRecord,
  'localId' | 'serverId' | 'ownerAccountId' | 'savedAt'
> & { savedAt: string };

export interface CreateReceipt {
  deliverableId: string;
  postId: string;
  postUrl: string;
  createUrl: string;
  status: 'Draft';
  sourceVersion: number;
  workflow: 'packet';
  disposition: 'created' | 'replayed' | 'updated';
  packetReceipt: { packetId: string; deliverableId: string; accepted: true };
  mediaSyncState: 'synced' | 'operator-diverged';
  warnings: Array<{ code: string; retryable: boolean; assetId?: string }>;
}

export interface PacketHandoff {
  sourceVersion: number;
  expectedSourceVersion: number | null;
  packetVersion: string;
  fingerprint: string;
  generatedAt: string;
  completedAt: string;
  receipt: CreateReceipt;
}

export interface IdeaPacket {
  id: string;
  version: string;
  state: IdeaPacketState;
  createdAt: string;
  updatedAt: string;
  actor: { id: string; name: string; nameEn: string };
  vibe: { label: string; labelEn: string; emoji: string };
  provenance: {
    sourceRoute: string;
    gridId: string;
    generatedAt: string;
    resultIds: string[];
    batchKeys: string[];
  };
  anchor: { imageUrls: string[]; label: string };
  grids: PacketGrid[];
  sourceCards: PacketSourceCard[];
  media: PacketMedia[];
  outputs: PacketOutput[];
  notes: string;
  workingAngle: string;
  captionSeeds: string;
  outputAngles: string;
  handoff?: PacketHandoff;
}

export class IdeaPacketError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function packetFromGrid(data: StarOfDayData, images: GridItemData[]): IdeaPacket {
  const createdAt = new Date().toISOString();
  const grid = packetGridFromStar(data, images, createdAt);
  const gridId = grid.id;
  return {
    id: crypto.randomUUID(),
    version: createdAt,
    state: 'collecting',
    createdAt,
    updatedAt: createdAt,
    actor: { id: data.actorId, name: data.actorName, nameEn: data.actorShortNameEn },
    vibe: { label: data.vibeLabel, labelEn: data.vibeLabelEn, emoji: data.vibeEmoji },
    provenance: {
      sourceRoute: `${window.location.pathname}${window.location.search}`,
      gridId,
      generatedAt: data.generatedAt || createdAt,
      resultIds: images.map(image => image.id),
      batchKeys: [...new Set(images.flatMap(image => image.batchKey ? [image.batchKey] : []))],
    },
    anchor: {
      imageUrls: images.map(image => image.thumbnail),
      label: `${data.actorName} · ${data.vibeLabel}`,
    },
    grids: [grid],
    sourceCards: images.map((image, order) => sourceCardFromResult(image, order, createdAt)),
    media: [],
    outputs: [gridOutput(grid, createdAt)],
    notes: '',
    workingAngle: '',
    captionSeeds: data.vibeSubtitle.trim(),
    outputAngles: '',
  };
}

function packetGridFromStar(
  data: StarOfDayData,
  images: GridItemData[],
  savedAt: string,
): PacketGrid {
  const chosen = data.rankedBatches[0];
  return {
    kind: 'grid',
    schemaVersion: 1,
    rendererVersion: 'vibe-atlas-v1',
    id: `vibe-atlas-${data.date}-${data.actorId}`,
    actorId: data.actorId,
    actor: data.actorName,
    actorEn: data.actorShortNameEn,
    actorAccentColor: data.actorAccentColor,
    vibe: data.vibeLabel,
    vibeEn: data.vibeLabelEn,
    vibeEmoji: data.vibeEmoji,
    vibeSubtitle: data.vibeSubtitle,
    vibeSubtitleEn: data.vibeSubtitleEn,
    searchSpell: data.generationQuery?.trim() || chosen?.query || '',
    ...(data.generationPrompt ? { generationPrompt: data.generationPrompt } : {}),
    ...(data.ctaSeed ? { ctaSeed: data.ctaSeed } : {}),
    edition: {
      provider: chosen?.provider ?? null,
      misprint: chosen?.misprint === true,
      legendary: chosen?.legendary === true,
    },
    capturedDate: data.date,
    generatedAt: data.generatedAt || savedAt,
    savedAt,
    sourceRoute: `${window.location.pathname}${window.location.search}`,
    images: images.map((image, gridPosition) => ({
      resultId: image.id,
      imageUrl: image.thumbnail,
      sourceUrl: image.url,
      title: image.title,
      ...(image.publisher ? { publisher: image.publisher } : {}),
      ...(image.batchKey ? { batchKey: image.batchKey } : {}),
      gridPosition,
    })),
  };
}

export function mediaFromResult(image: GridItemData): PacketMedia {
  return {
    id: stableMediaId(image.id),
    imageUrl: image.thumbnail,
    sourceUrl: image.url,
    title: image.title,
    ...(image.publisher ? { publisher: image.publisher } : {}),
    resultId: image.id,
    ...(image.batchKey ? { batchKey: image.batchKey } : {}),
    ...(image.gridPosition !== undefined ? { gridPosition: image.gridPosition } : {}),
    addedAt: new Date().toISOString(),
  };
}

export function packetFromCollectionGrid(grid: GridRecord): IdeaPacket {
  const createdAt = new Date().toISOString();
  const packetGrid = packetGridFromCollectionGrid(grid);
  return {
    id: crypto.randomUUID(),
    version: createdAt,
    state: 'collecting',
    createdAt,
    updatedAt: createdAt,
    actor: { id: grid.actorId, name: grid.actor, nameEn: grid.actorEn },
    vibe: { label: grid.vibe, labelEn: grid.vibeEn, emoji: grid.vibeEmoji },
    provenance: {
      sourceRoute: grid.sourceRoute,
      gridId: grid.id,
      generatedAt: grid.generatedAt,
      resultIds: grid.images.map(image => image.resultId),
      batchKeys: [...new Set(grid.images.flatMap(image => image.batchKey ? [image.batchKey] : []))],
    },
    anchor: {
      imageUrls: grid.images.map(image => image.imageUrl),
      label: `${grid.actor} · ${grid.vibe}`,
    },
    grids: [packetGrid],
    sourceCards: grid.images.map((image, order) => ({
      id: stableMediaId(image.resultId),
      order,
      imageUrl: image.imageUrl,
      sourceUrl: image.sourceUrl,
      title: image.title,
      ...(image.publisher ? { creator: image.publisher } : {}),
      capturedAt: grid.generatedAt,
      resultId: image.resultId,
      provenance: JSON.stringify({
        collection: 'saved-grid-history',
        gridId: grid.id,
        batchKey: image.batchKey,
        gridPosition: image.gridPosition,
      }),
    })),
    media: [],
    outputs: [gridOutput(packetGrid, createdAt)],
    notes: grid.legacyCompositeUrl ? 'Recovered from a legacy exported-grid record.' : '',
    // Grid Builder stores its curation rationale in generationPrompt; carry
    // it into the packet's working angle so the creative brief reaches CREATE.
    // Daily grids also carry generationPrompt (the raw image-generation
    // prompt) — that must NOT become the working angle, so scope to builder.
    workingAngle: grid.edition?.provider === 'collection-grid-builder' ? (grid.generationPrompt || '') : '',
    captionSeeds: grid.vibeSubtitle,
    outputAngles: '',
  };
}

export function packetGridFromCollectionGrid(grid: GridRecord): PacketGrid {
  const {
    localId: _localId,
    serverId: _serverId,
    ownerAccountId: _ownerAccountId,
    ...packetGrid
  } = grid;
  return packetGrid;
}

export function mediaFromCollectionCard(card: CardRecord): PacketMedia {
  const resultId = collectionCardResultId(card);
  return {
    id: stableMediaId(resultId),
    imageUrl: card.thumbnailUrl,
    sourceUrl: card.sourceUrl || card.imageUrl,
    title: `${card.actor} · ${card.vibe}`,
    publisher: card.actorEn,
    resultId,
    ...(card.gridContext?.batchKey ? { batchKey: card.gridContext.batchKey } : {}),
    ...(card.gridContext ? { gridPosition: card.gridContext.position } : {}),
    addedAt: new Date().toISOString(),
  };
}

function collectionCardResultId(card: CardRecord): string {
  if (card.resultId) return card.resultId;
  if (card.gridContext) {
    return [
      'legacy-card',
      card.capturedDate,
      stableMediaId(card.actorEn || card.actor),
      card.gridContext.batchKey || 'unknown-batch',
      card.gridContext.position,
    ].join(':');
  }
  return `legacy-card:${card.capturedDate}:${stableMediaId(card.actorEn || card.actor)}:${stableMediaId(card.imageUrl)}`;
}

export async function fetchIdeaPackets(): Promise<IdeaPacket[]> {
  const response = await fetch('/api/idea-packets', { headers: packetHeaders() });
  const body = await readJson(response);
  if (!response.ok) throw new IdeaPacketError(stringField(body, 'error') || 'Idea Packets could not be loaded.', response.status);
  const packets = body && typeof body === 'object' ? Reflect.get(body, 'packets') : null;
  if (!Array.isArray(packets)) throw new IdeaPacketError('Idea Packets returned an invalid response.', 502);
  return packets as IdeaPacket[];
}

export async function createIdeaPacket(packet: IdeaPacket): Promise<IdeaPacket> {
  return packetRequest('POST', { packet });
}

export async function mutateIdeaPacket(
  packet: IdeaPacket,
  action: Record<string, unknown>,
): Promise<IdeaPacket> {
  return packetRequest('PATCH', { id: packet.id, expectedVersion: packet.version, action });
}

export function downloadPacketHandoff(packet: IdeaPacket): void {
  const artifact = {
    schema: 'fandom.idea-packet.handoff.v1',
    exportedAt: new Date().toISOString(),
    destination: 'CREATE (manual fallback)',
    packet,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(artifact, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `idea-packet-${packet.id}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function includedPacketOutputs(packet: IdeaPacket): PacketOutput[] {
  return packet.outputs.filter(output => output.included);
}

function sourceCardFromResult(image: GridItemData, order: number, capturedAt: string): PacketSourceCard {
  return {
    id: stableMediaId(image.id),
    order,
    imageUrl: image.thumbnail,
    sourceUrl: image.url,
    title: image.title,
    ...(image.publisher ? { creator: image.publisher } : {}),
    capturedAt,
    resultId: image.id,
    provenance: JSON.stringify({
      collection: 'star-of-the-day',
      batchKey: image.batchKey,
      gridPosition: image.gridPosition ?? order,
    }),
  };
}

export function gridOutput(grid: PacketGrid, addedAt = new Date().toISOString()): PacketOutput {
  return {
    id: `grid-${stableMediaId(grid.id)}`,
    kind: 'grid',
    sourceId: grid.id,
    label: `${grid.vibeEmoji} ${grid.actor} · ${grid.vibe} grid`,
    included: true,
    addedAt,
  };
}

async function packetRequest(method: 'POST' | 'PATCH', body: unknown): Promise<IdeaPacket> {
  const response = await fetch('/api/idea-packets', {
    method,
    headers: { ...packetHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await readJson(response);
  if (!response.ok) throw new IdeaPacketError(stringField(result, 'error') || 'Idea Packet could not be saved.', response.status);
  const packet = result && typeof result === 'object' ? Reflect.get(result, 'packet') : null;
  if (!packet || typeof packet !== 'object') throw new IdeaPacketError('Idea Packets returned an invalid saved packet.', 502);
  return packet as IdeaPacket;
}

function packetHeaders(): Record<string, string> {
  const token = typeof sessionStorage === 'undefined' ? '' : sessionStorage.getItem('plan_operator_token') ?? '';
  return { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new IdeaPacketError('Idea Packets returned invalid JSON.', 502); }
}

function stringField(value: unknown, field: string): string {
  if (!value || typeof value !== 'object') return '';
  const candidate = Reflect.get(value, field);
  return typeof candidate === 'string' ? candidate : '';
}

function stableMediaId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
