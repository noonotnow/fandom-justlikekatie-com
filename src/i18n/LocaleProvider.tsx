import { useCallback, useEffect, useMemo, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import {
  CHINESE_LOCALE,
  getLocale,
  localizedPath,
  setLocalePreference,
  type Locale,
} from "./locale";
import { baseMessages } from "./catalog";
import { isLocaleSwitcherRoute } from "../utils/fandomRoutes";
import { LanguageSelector } from "./LanguageSelector";
import { LocaleContext, type LocaleContextValue } from "./LocaleContext";

export { useLocale } from "./LocaleContext";

const LOCALE_CHANGE_EVENT = "fandom:locale-change";

function isInternalLocaleRoute(pathname: string, search = "", hash = ""): boolean {
  return isLocaleSwitcherRoute(pathname, search, hash);
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => getLocale());

  const setLocale = useCallback((nextLocale: Locale) => {
    if (nextLocale === locale || typeof window === "undefined") return;
    setLocalePreference(nextLocale);
    const destination = localizedPath(
      `${window.location.pathname}${window.location.search}`,
      nextLocale,
    );
    if (destination !== `${window.location.pathname}${window.location.search}`) {
      window.history.pushState(window.history.state, "", destination);
    }
    setLocaleState(nextLocale);
    window.dispatchEvent(new CustomEvent(LOCALE_CHANGE_EVENT, { detail: nextLocale }));
  }, [locale]);

  useEffect(() => {
    const syncLocale = () => setLocaleState(getLocale());
    window.addEventListener("popstate", syncLocale);
    window.addEventListener(LOCALE_CHANGE_EVENT, syncLocale);
    return () => {
      window.removeEventListener("popstate", syncLocale);
      window.removeEventListener(LOCALE_CHANGE_EVENT, syncLocale);
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === CHINESE_LOCALE ? "zh-CN" : "en";
  }, [locale]);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    t: (english, chinese) => locale === CHINESE_LOCALE ? chinese : english,
    path: url => localizedPath(url, locale),
    setLocale,
  }), [locale, setLocale]);

  const relocalizeCoreLink = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (!isInternalLocaleRoute(window.location.pathname, window.location.search, window.location.hash)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest<HTMLAnchorElement>("a[href]");
    if (!anchor || anchor.hasAttribute("download")) return;
    const targetWindow = anchor.getAttribute("target");
    if (targetWindow && targetWindow !== "_self") return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin || !isInternalLocaleRoute(url.pathname, url.search, url.hash)) return;
    anchor.href = localizedPath(`${url.pathname}${url.search}${url.hash}`, locale);
  }, [locale]);

  const inScope = isInternalLocaleRoute(window.location.pathname, window.location.search, window.location.hash);
  return (
    <LocaleContext.Provider value={value}>
      <div onClickCapture={relocalizeCoreLink}>
        {children}
      </div>
      {inScope && (
        <LanguageSelector
          locale={locale}
          languageLabel={baseMessages[locale].language}
          onChange={setLocale}
        />
      )}
    </LocaleContext.Provider>
  );
}