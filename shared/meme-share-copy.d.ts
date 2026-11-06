import type { SocialPlatformId } from "./social-platforms.js";

export type SharePlatform = "rednote" | "tiktok" | "instagram";
export type ShareCopyField = Readonly<{
  key: string;
  label: string;
  maxLength: number;
  required: boolean;
  multiline?: boolean;
  placeholder?: string;
}>;
export type ShareCopyContract = Readonly<{
  platform: SharePlatform;
  writerName: string;
  postName: string;
  fields: readonly ShareCopyField[];
  tags: Readonly<{ min: number; max: number }>;
  guidance: readonly string[];
}>;
export type ShareCopy = { fields: Record<string, string>; tags: string[] };

export const SHARE_KIT_PLATFORMS: readonly SharePlatform[] & readonly SocialPlatformId[];
export const SHARE_TAG_PATTERN: RegExp;
export const MAX_SHARE_TAG_BODY: number;
export const SHARE_COPY_CONTRACTS: Readonly<Record<SharePlatform, ShareCopyContract>>;
export function shareCopyContract(platform: SharePlatform): ShareCopyContract;
export function normalizeShareTag(raw: unknown): string | null;
export function parseShareTags(text: string): string[];
export function templateShareCopy(
  platform: SharePlatform,
  joke: { setup?: string; punchline?: string },
  topicTags: readonly string[],
): ShareCopy;
export function shareCopyProblem(platform: SharePlatform, copy: ShareCopy | null | undefined): string | null;
export function formatSharePost(platform: SharePlatform, copy: ShareCopy | null | undefined): string;
