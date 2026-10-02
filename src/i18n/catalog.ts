import type { Locale } from "./locale";

export const baseMessages = {
  en: {
    language: "Language",
  },
  "zh-CN": {
    language: "语言",
  },
} satisfies Record<Locale, { language: string }>;