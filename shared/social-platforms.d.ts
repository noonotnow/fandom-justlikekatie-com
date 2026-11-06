export type SocialPlatformId = "rednote" | "weibo" | "instagram" | "tiktok";
export type SocialPlatform = Readonly<{ id: SocialPlatformId; label: string }>;

export const SOCIAL_PLATFORMS: Readonly<Record<SocialPlatformId, SocialPlatform>>;
export const SOCIAL_PLATFORM_IDS: readonly SocialPlatformId[];
export function isSocialPlatformId(value: unknown): value is SocialPlatformId;
export function platformAllowlist<const T extends readonly SocialPlatformId[]>(ids: T): Readonly<T>;
export function platformLabel(id: string): string;
