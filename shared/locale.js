export const SUPPORTED_LOCALES = Object.freeze(["en", "zh-CN"]);
export const DEFAULT_LOCALE = "en";
export const CHINESE_LOCALE = "zh-CN";
export const CHINESE_PATH_PREFIX = "/zh-cn";
export const LOCALE_PREFERENCE_KEY = "fandom_locale_preference";

const LOCALIZABLE_STATIC_PATHS = new Set([
  "/",
  "/vibe-atlas",
  "/vibe-atlas/archive",
  "/c-drama-fandom/trope-decoder",
]);
const TROPE_CARD_IDS = new Set([
  "cliff-of-amnesia",
  "three-lifetimes",
  "heavenly-bureaucracy",
  "tribulation-forecast",
  "mortal-arc",
  "warm-soup",
  "vow-fine-print",
  "useful-sect",
  "eight-words",
  "cultivation-level-up",
  "sword-with-opinions",
  "fox-spirit-reveal",
  "tragic-filing-cabinet",
  "fate-receipts",
]);

const SAFE_VIEWS = new Set([
  "daily",
  "collection",
  "results",
  "builder",
  "released",
  "membership",
  "admin",
  "plan",
]);
const SAFE_SOURCES = new Set([
  "collection",
  "daily",
  "edition",
  "daily_star",
  "article",
  "archive",
]);
const SAFE_QUERY_KEYS = new Set([
  "view",
  "date",
  "source",
  "actorId",
  "vibeIdx",
  "page",
  "membership",
  "admin",
]);

function isEditionDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function safeQueryValue(key, value) {
  if (!SAFE_QUERY_KEYS.has(key)) return false;
  if (key === "view") return SAFE_VIEWS.has(value);
  if (key === "date") return isEditionDate(value);
  if (key === "source") return SAFE_SOURCES.has(value);
  if (key === "actorId") return /^[a-z0-9][a-z0-9-]{0,79}$/i.test(value);
  if (key === "vibeIdx") return /^(?:0|[1-9]\d?)$/.test(value);
  if (key === "page") return /^[1-9]\d{0,3}$/.test(value);
  if (key === "membership") return value === "success";
  if (key === "admin") return value === "true";
  return false;
}

function safeSearch(search) {
  const incoming = new URLSearchParams(search);
  const safe = new URLSearchParams();
  const seen = new Set();
  for (const [key, value] of incoming) {
    if (seen.has(key) || !safeQueryValue(key, value)) continue;
    seen.add(key);
    safe.append(key, value);
  }
  return safe.toString();
}

function normalizedRoutePath(pathname) {
  const withoutLocale = stripLocalePath(pathname || "/");
  return withoutLocale.length > 1 ? withoutLocale.replace(/\/+$/, "") : withoutLocale;
}

function isVibeAtlasRoute(pathname) {
  const routePath = normalizedRoutePath(pathname);
  return routePath === "/"
    || routePath === "/vibe-atlas"
    || routePath === "/vibe-atlas/archive"
    || routePath === "/vibe-atlas/actors"
    || routePath === "/vibe-atlas/editions"
    || routePath === "/vibe-atlas/packs"
    || /^\/vibe-atlas\/actors\/[a-z0-9-]+$/i.test(routePath)
    || /^\/vibe-atlas\/editions\/\d{4}-\d{2}-\d{2}\/[a-z0-9-]+$/i.test(routePath)
    || /^\/vibe-atlas\/packs\/[a-z0-9-]+\/[a-z0-9-]+$/i.test(routePath);
}

function isLocalizableRoute(pathname) {
  const routePath = normalizedRoutePath(pathname);
  return LOCALIZABLE_STATIC_PATHS.has(routePath) || isVibeAtlasRoute(routePath);
}

function isTropeDecoderRoute(pathname) {
  return normalizedRoutePath(pathname) === "/c-drama-fandom/trope-decoder";
}

/**
 * Removes the Simplified Chinese locale prefix from an app pathname.
 * Unprefixed paths are the explicit English routes, including `/`.
 */
export function stripLocalePath(pathname) {
  if (typeof pathname !== "string" || !pathname) return "/";
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (normalized.toLowerCase() === CHINESE_PATH_PREFIX) return "/";
  if (normalized.toLowerCase().startsWith(`${CHINESE_PATH_PREFIX}/`)) {
    return normalized.slice(CHINESE_PATH_PREFIX.length) || "/";
  }
  return normalized;
}

export function isSupportedLocale(locale) {
  return SUPPORTED_LOCALES.includes(locale);
}

export function getLocalePreference() {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const stored = window.localStorage?.getItem(LOCALE_PREFERENCE_KEY);
    return isSupportedLocale(stored) ? stored : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function setLocalePreference(locale) {
  if (!isSupportedLocale(locale) || typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(LOCALE_PREFERENCE_KEY, locale);
  } catch {
    // The locale URL remains authoritative when browser storage is unavailable.
  }
}

function authFragmentLocale() {
  if (typeof window === "undefined") return undefined;
  const fromFragment = new URLSearchParams((window.location?.hash || "").slice(1)).get("locale");
  return isSupportedLocale(fromFragment) ? fromFragment : undefined;
}

/**
 * Builds an in-app localized URL only for routes with a verified equivalent.
 * English-only destinations remain untouched. Auth fragments, tokens, handoff
 * capabilities, and arbitrary query values are not propagated; only known
 * trope-card fragments are retained on the decoder route.
 */
export function localizedPath(path, locale) {
  if (typeof path !== "string" || !path) return locale === CHINESE_LOCALE ? `${CHINESE_PATH_PREFIX}/` : "/";
  if (/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(path)) {
    if (typeof window !== "undefined") {
      try {
        const absolute = new URL(path, window.location.href);
        if (absolute.origin === window.location.origin) {
          const destination = localizedPath(`${absolute.pathname}${absolute.search}${absolute.hash}`, locale);
          return `${absolute.origin}${destination}`;
        }
      } catch {
        return path;
      }
    }
    return path;
  }

  const hashIndex = path.indexOf("#");
  const beforeHash = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
  const queryIndex = beforeHash.indexOf("?");
  const pathname = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  const search = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : "";
  const basePath = stripLocalePath(pathname || "/");
  if (!isLocalizableRoute(basePath)) return path;

  const fragment = hashIndex >= 0 ? path.slice(hashIndex + 1) : "";
  const safeFragment = isTropeDecoderRoute(basePath) && TROPE_CARD_IDS.has(fragment)
    ? `#${fragment}`
    : "";
  const normalizedLocale = locale === CHINESE_LOCALE ? CHINESE_LOCALE : DEFAULT_LOCALE;
  const localized = normalizedLocale === CHINESE_LOCALE
    ? basePath === "/" ? `${CHINESE_PATH_PREFIX}/` : `${CHINESE_PATH_PREFIX}${basePath}`
    : basePath;
  const query = isVibeAtlasRoute(basePath) ? safeSearch(search) : "";
  return `${localized}${query ? `?${query}` : ""}${safeFragment}`;
}

/**
 * Resolve explicit locale URLs first. Unprefixed core routes (including `/`)
 * are explicit English; the neutral auth callback may use its allowlisted
 * return locale or remembered preference. Unknown and English-only routes
 * default to English.
 */
export function getLocale(pathname, authReturnLocale) {
  const currentPath = pathname
    ?? (typeof window !== "undefined" ? window.location?.pathname : undefined)
    ?? "/";
  if (stripLocalePath(currentPath) !== currentPath) return CHINESE_LOCALE;

  if (normalizedRoutePath(currentPath) === "/auth/verify") {
    return isSupportedLocale(authReturnLocale)
      ? authReturnLocale
      : authFragmentLocale() || getLocalePreference();
  }
  return DEFAULT_LOCALE;
}