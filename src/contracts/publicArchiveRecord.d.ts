import { PUBLIC_ROUTE_PATHS } from '../../shared/public-routes.js';

export type PublicActorRecordPath = `${typeof PUBLIC_ROUTE_PATHS.vibeAtlasActors}/${string}`;
export type PublicEditionRecordPath = `${typeof PUBLIC_ROUTE_PATHS.vibeAtlasEditions}/${string}`;

export interface PublicArchiveRecord {
  actorPath: PublicActorRecordPath;
  editionPath: PublicEditionRecordPath;
}

export function publicArchiveRecord(value: unknown): PublicArchiveRecord | undefined;
export function assertPublicArchiveRecord(
  value: unknown,
  expected?: {
    expectedDate?: string | null;
    expectedActorSlug?: string | null;
  },
): PublicArchiveRecord;