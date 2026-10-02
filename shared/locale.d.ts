export type Locale = "en" | "zh-CN";

export const SUPPORTED_LOCALES: readonly Locale[];
export const DEFAULT_LOCALE: "en";
export const CHINESE_LOCALE: "zh-CN";
export const CHINESE_PATH_PREFIX: "/zh-cn";
export const LOCALE_PREFERENCE_KEY: "fandom_locale_preference";
export function stripLocalePath(pathname: string): string;
export function isSupportedLocale(locale: unknown): locale is Locale;
export function getLocalePreference(): Locale;
export function setLocalePreference(locale: Locale): void;
export function localizedPath(path: string, locale: Locale): string;
export function getLocale(pathname?: string, authReturnLocale?: unknown): Locale;