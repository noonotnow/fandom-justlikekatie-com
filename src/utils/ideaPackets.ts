import type { GridItemData } from '../types';
import type { StarOfDayData } from '../hooks/useStarOfDay';

export type IdeaPacketState = 'collecting' | 'media_compiled';

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
  media: PacketMedia[];
  notes: string;
  workingAngle: string;
  captionSeeds: string;
  outputAngles: string;
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
  const gridId = `vibe-atlas-${data.date}-${data.actorId}`;
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
    media: [],
    notes: '',
    workingAngle: '',
    captionSeeds: data.vibeSubtitle.trim(),
    outputAngles: '',
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
    destination: 'CREATE/PLAN (manual import pending)',
    packet,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(artifact, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `idea-packet-${packet.id}.json`;
  link.click();
  URL.revokeObjectURL(url);
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
