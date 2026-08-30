import type { GridRecord } from './collectionDB';
import { completeIdeaPacketHandoff } from './createHandoffClient';
import { renderPacketOutputs } from './createHandoff';
import {
  createIdeaPacket,
  fetchIdeaPackets,
  IdeaPacketError,
  mutateIdeaPacket,
  packetFromCollectionGrid,
  type CreateReceipt,
  type IdeaPacket,
} from './ideaPackets';

export const CREATOR_DRAFT_SOURCE_SCHEMA = 'fandom.creator-draft-source.v1';

export interface CreatorDraftSource {
  schema: typeof CREATOR_DRAFT_SOURCE_SCHEMA;
  kind: 'ordered-grid';
  sourceId: string;
  sourceVersion: string;
  idempotencyKey: string;
  actor: {
    id: string;
    name: string;
    nameEn: string;
  };
  creativeContext: {
    vibe: string;
    vibeEn: string;
    brief: string;
    captionSeed?: string;
  };
  orderedImages: Array<{
    position: number;
    resultId: string;
    sourceUrl: string;
    title: string;
    publisher?: string;
    batchKey?: string;
  }>;
}

export interface CreatorDraftResult {
  source: CreatorDraftSource;
  compatibilityPacket: IdeaPacket;
  receipt: CreateReceipt;
}

/** Future-facing source contract; no arbitrary client URL is sent to CREATE from it. */
export function creatorDraftSourceFromGrid(grid: GridRecord): CreatorDraftSource {
  const sourceVersion = `${grid.schemaVersion}:${grid.generatedAt}:${grid.images.map(image => image.resultId).join('|')}`;
  return {
    schema: CREATOR_DRAFT_SOURCE_SCHEMA,
    kind: 'ordered-grid',
    sourceId: grid.id,
    sourceVersion,
    idempotencyKey: `grid:${grid.id}:${stableHash(sourceVersion)}`,
    actor: {
      id: grid.actorId,
      name: grid.actor,
      nameEn: grid.actorEn,
    },
    creativeContext: {
      vibe: grid.vibe,
      vibeEn: grid.vibeEn,
      brief: grid.generationPrompt || '',
      ...(grid.ctaSeed ? { captionSeed: grid.ctaSeed } : {}),
    },
    orderedImages: [...grid.images]
      .sort((a, b) => a.gridPosition - b.gridPosition)
      .map(image => ({
        position: image.gridPosition,
        resultId: image.resultId,
        sourceUrl: image.sourceUrl,
        title: image.title,
        ...(image.publisher ? { publisher: image.publisher } : {}),
        ...(image.batchKey ? { batchKey: image.batchKey } : {}),
      })),
  };
}

/**
 * One-click Creator OS crossover. Idea Packets remain the trusted server-side
 * compatibility adapter until CREATE accepts CreatorDraftSource directly.
 */
export async function makeCreatorPostFromGrid(grid: GridRecord): Promise<CreatorDraftResult> {
  const source = creatorDraftSourceFromGrid(grid);
  const draft = packetFromCollectionGrid(grid);
  draft.id = `creator-grid-${stableHash(source.idempotencyKey)}`;
  let compatibilityPacket: IdeaPacket;
  try {
    compatibilityPacket = await createIdeaPacket(draft);
  } catch (error) {
    if (!(error instanceof IdeaPacketError) || error.status !== 409) throw error;
    const existing = (await fetchIdeaPackets()).find(packet => packet.id === draft.id);
    if (!existing || existing.provenance.gridId !== grid.id) {
      throw new Error('The existing Creator OS draft source does not match this saved grid.');
    }
    compatibilityPacket = existing;
  }
  if (compatibilityPacket.handoff?.receipt) {
    return { source, compatibilityPacket, receipt: compatibilityPacket.handoff.receipt };
  }
  const compiled = compatibilityPacket.state === 'media_compiled'
    ? compatibilityPacket
    : await mutateIdeaPacket(compatibilityPacket, { type: 'set_state', state: 'media_compiled' });
  const receipt = await completeIdeaPacketHandoff(compiled, renderPacketOutputs);
  return { source, compatibilityPacket: compiled, receipt };
}

export async function makeCreatorPostFromPacket(
  packet: IdeaPacket,
): Promise<{ compatibilityPacket: IdeaPacket; receipt: CreateReceipt }> {
  const created = await createIdeaPacket(packet);
  const compiled = await mutateIdeaPacket(created, { type: 'set_state', state: 'media_compiled' });
  const receipt = await completeIdeaPacketHandoff(compiled, renderPacketOutputs);
  return { compatibilityPacket: compiled, receipt };
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}