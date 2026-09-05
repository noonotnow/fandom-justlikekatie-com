import type { GridRecord } from './collectionDB';

export const RELEASE_CANDIDATE_IDENTITY_SCHEMA_VERSION = 1;

export type PublicationSourceType = 'operator_rescue' | 'curated_board';
export type BoardProvenanceClassification =
  | 'exact-approved-board'
  | 'derived-from-approved-board'
  | 'unverified-saved-grid';

export interface ReleaseCandidateIdentity {
  schemaVersion: typeof RELEASE_CANDIDATE_IDENTITY_SCHEMA_VERSION;
  auditRunId: string;
  publicationManifestId: string | null;
  publicationSourceType: PublicationSourceType;
  rescueReceiptId: string | null;
  boardHash: string;
  orderedCandidateIds: string[];
  actorId: string;
  vibeKey: string;
  curationVersion: number;
  promiseContractVersion: number;
  identityProfileVersion: number;
}

export interface ReleaseCandidateProvenance {
  schemaVersion: 1;
  source: 'actor-preflight-approval';
  identity: ReleaseCandidateIdentity;
  candidates: Array<{
    candidateId: string;
    imageDigest: string;
    thumbnail: string;
    title: string;
    source: string;
    batchRank: number | null;
  }>;
}

export interface ClassifiedBoardProvenance {
  classification: BoardProvenanceClassification;
  approvalAuthority: boolean;
  releaseCandidateIdentity: ReleaseCandidateIdentity | null;
  sourceReleaseCandidateIdentity: ReleaseCandidateIdentity | null;
}

export function isReleaseCandidateIdentity(value: unknown): value is ReleaseCandidateIdentity {
  if (!value || typeof value !== 'object') return false;
  const identity = value as Partial<ReleaseCandidateIdentity>;
  return identity.schemaVersion === RELEASE_CANDIDATE_IDENTITY_SCHEMA_VERSION
    && nonEmpty(identity.auditRunId)
    && (identity.publicationManifestId === null || nonEmpty(identity.publicationManifestId))
    && ['operator_rescue', 'curated_board'].includes(identity.publicationSourceType || '')
    && (identity.rescueReceiptId === null || nonEmpty(identity.rescueReceiptId))
    && (identity.publicationSourceType !== 'operator_rescue' || nonEmpty(identity.rescueReceiptId))
    && typeof identity.boardHash === 'string'
    && /^[a-f0-9]{64}$/i.test(identity.boardHash)
    && Array.isArray(identity.orderedCandidateIds)
    && identity.orderedCandidateIds.length === 9
    && identity.orderedCandidateIds.every(nonEmpty)
    && new Set(identity.orderedCandidateIds).size === 9
    && nonEmpty(identity.actorId)
    && nonEmpty(identity.vibeKey)
    && positiveVersion(identity.curationVersion)
    && positiveVersion(identity.promiseContractVersion)
    && positiveVersion(identity.identityProfileVersion);
}

export async function classifyGridProvenance(grid: GridRecord): Promise<ClassifiedBoardProvenance> {
  const provenance = grid.releaseCandidateProvenance;
  if (provenance?.schemaVersion !== 1
    || provenance.source !== 'actor-preflight-approval'
    || !isReleaseCandidateIdentity(provenance.identity)
    || !Array.isArray(provenance.candidates)
    || provenance.candidates.length !== 9) return unverified();
  const identity = provenance.identity;
  const computedBoardHash = await sha256(JSON.stringify(provenance.candidates.map(candidate => ({
    thumbnail: candidate.thumbnail,
    title: candidate.title,
    source: candidate.source,
    batchRank: candidate.batchRank,
  }))));
  if (computedBoardHash !== identity.boardHash) return unverified();
  const orderedImages = [...grid.images]
    .sort((left, right) => left.gridPosition - right.gridPosition);
  const orderedCandidateIds = orderedImages.map(image => image.resultId);
  const exact = grid.actorId === identity.actorId
    && grid.vibeKey === identity.vibeKey
    && orderedCandidateIds.length === 9
    && orderedCandidateIds.every((candidateId, index) =>
      candidateId === identity.orderedCandidateIds[index])
    && orderedImages.every((image, index) => {
      const approved = provenance.candidates[index];
      return approved?.candidateId === image.resultId
        && approved.imageDigest === image.media?.checksum
        && approved.thumbnail === originalImageUrl(image)
        && approved.title === image.title
        && approved.source === (image.publisher || '')
        && approved.batchRank === (image.batchRank ?? null);
    });
  return {
    classification: exact ? 'exact-approved-board' : 'derived-from-approved-board',
    approvalAuthority: exact,
    releaseCandidateIdentity: exact ? identity : null,
    sourceReleaseCandidateIdentity: identity,
  };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function originalImageUrl(image: GridRecord['images'][number]): string {
  const value = image.mediaRecovery?.sourceUrl || image.imageUrl;
  try {
    const parsed = new URL(value, 'https://fandom.justlikekatie.com');
    return parsed.searchParams.get('url') || value;
  } catch {
    return value;
  }
}

export function boardProvenanceLabel(classification: BoardProvenanceClassification): string {
  if (classification === 'exact-approved-board') return 'Exact approved board';
  if (classification === 'derived-from-approved-board') return 'Derived from approved board';
  return 'Unverified saved grid';
}

function unverified(): ClassifiedBoardProvenance {
  return {
    classification: 'unverified-saved-grid',
    approvalAuthority: false,
    releaseCandidateIdentity: null,
    sourceReleaseCandidateIdentity: null,
  };
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function positiveVersion(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}
