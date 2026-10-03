import type { Server } from "node:http";
export const NAME_KEY_ROUTE: string;
export const BOARD_LABEL: string;
export const JOURNAL_LABEL: string;
export const STAGING_ROOT: string;
export function stageUntamedNameKey(output?: string): Map<string, string>;
export function createStagingServer(output?: string): Server;
export function writePrivateReviewPreview(): string;