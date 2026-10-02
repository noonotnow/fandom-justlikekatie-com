import {
  getLocale as getRuntimeLocale,
  localizedPath,
  type Locale,
} from "../../shared/locale.js";

export type { Locale } from "../../shared/locale.js";
export {
  CHINESE_LOCALE,
  getLocalePreference,
  setLocalePreference,
} from "../../shared/locale.js";

export function getLocale(): Locale {
  return getRuntimeLocale();
}

export function translate(english: string, chinese: string): string {
  return getLocale() === "zh-CN" ? chinese : english;
}

export { localizedPath };