import { createContext, useContext } from 'react';
import type { Locale } from './locale';

export interface LocaleContextValue {
  locale: Locale;
  t: (english: string, chinese: string) => string;
  path: (url: string) => string;
  setLocale: (locale: Locale) => void;
}

export const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used within LocaleProvider.');
  return context;
}