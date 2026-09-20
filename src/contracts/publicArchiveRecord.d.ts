export type PublicActorRecordPath = `/vibe-atlas/actors/${string}`;
export type PublicEditionRecordPath = `/vibe-atlas/editions/${string}`;

export interface PublicArchiveRecord {
  actorPath: PublicActorRecordPath;
  editionPath: PublicEditionRecordPath;
}

export function publicArchiveRecord(value: unknown): PublicArchiveRecord | undefined;