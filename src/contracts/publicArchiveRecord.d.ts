export interface PublicArchiveRecord {
  actorPath: string;
  editionPath: string;
}

export function publicArchiveRecord(value: unknown): PublicArchiveRecord | undefined;