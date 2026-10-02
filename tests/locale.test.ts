import test from "node:test";
import assert from "node:assert/strict";
import {
  CHINESE_LOCALE,
  getLocale,
  getLocalePreference,
  isSupportedLocale,
  localizedPath,
  LOCALE_PREFERENCE_KEY,
  setLocalePreference,
  stripLocalePath,
} from "../shared/locale.js";
import {
  CHINESE_LOCALE as EXPORTED_CHINESE_LOCALE,
  translate,
} from "../src/i18n/locale.ts";

test("locale path helpers recognize only the Simplified Chinese prefix", () => {
  assert.equal(EXPORTED_CHINESE_LOCALE, CHINESE_LOCALE);
  assert.equal(stripLocalePath("/zh-cn"), "/");
  assert.equal(stripLocalePath("/zh-cn/"), "/");
  assert.equal(stripLocalePath("/zh-cn/vibe-atlas/archive"), "/vibe-atlas/archive");
  assert.equal(stripLocalePath("/zh-cnish/vibe-atlas"), "/zh-cnish/vibe-atlas");
  assert.equal(isSupportedLocale("zh-CN"), true);
  assert.equal(isSupportedLocale("zh-TW"), false);
});

test("localized paths preserve safe edition and builder context and omit unsafe query/hash state", () => {
  assert.equal(
    localizedPath(
      "/vibe-atlas?view=builder&source=edition&date=2026-09-19&handoff-preview=1#token=secret",
      CHINESE_LOCALE,
    ),
    "/zh-cn/vibe-atlas?view=builder&source=edition&date=2026-09-19",
  );
  assert.equal(
    localizedPath("/zh-cn/vibe-atlas?view=collection&admin=true", "en"),
    "/vibe-atlas?view=collection&admin=true",
  );
  assert.equal(localizedPath("/", CHINESE_LOCALE), "/zh-cn/");
  assert.equal(localizedPath("/zh-cn/", "en"), "/");
});

test("only routes with a verified localized equivalent receive the Chinese prefix", () => {
  assert.equal(
    localizedPath("/c-drama-fandom/glossary/?view=builder#cold-lead", CHINESE_LOCALE),
    "/c-drama-fandom/glossary/?view=builder#cold-lead",
  );
  assert.equal(
    localizedPath("/vibe-atlas/veteran-journal", CHINESE_LOCALE),
    "/vibe-atlas/veteran-journal",
  );
  assert.equal(
    localizedPath("/vibe-atlas/actors/liu-xueyi", CHINESE_LOCALE),
    "/zh-cn/vibe-atlas/actors/liu-xueyi",
  );
  assert.equal(
    localizedPath("/vibe-atlas/actors", CHINESE_LOCALE),
    "/zh-cn/vibe-atlas/actors",
  );
  assert.equal(
    localizedPath("/vibe-atlas/editions", CHINESE_LOCALE),
    "/zh-cn/vibe-atlas/editions",
  );
  assert.equal(
    localizedPath("/vibe-atlas/packs", CHINESE_LOCALE),
    "/zh-cn/vibe-atlas/packs",
  );
  assert.equal(
    localizedPath("/vibe-atlas/editions/2026-09-19/liu-xueyi", CHINESE_LOCALE),
    "/zh-cn/vibe-atlas/editions/2026-09-19/liu-xueyi",
  );
  assert.equal(
    localizedPath("/vibe-atlas/packs/liu-xueyi/boyfriend-lighting", CHINESE_LOCALE),
    "/zh-cn/vibe-atlas/packs/liu-xueyi/boyfriend-lighting",
  );
});

test("only known trope decoder card fragments survive locale switching", () => {
  assert.equal(
    localizedPath("/c-drama-fandom/trope-decoder/#cliff-of-amnesia", CHINESE_LOCALE),
    "/zh-cn/c-drama-fandom/trope-decoder/#cliff-of-amnesia",
  );
  assert.equal(
    localizedPath("/zh-cn/c-drama-fandom/trope-decoder/#cliff-of-amnesia", "en"),
    "/c-drama-fandom/trope-decoder/#cliff-of-amnesia",
  );
  assert.equal(
    localizedPath("/c-drama-fandom/trope-decoder/#token=secret", CHINESE_LOCALE),
    "/zh-cn/c-drama-fandom/trope-decoder/",
  );
});

test("explicit English core URLs win while neutral auth returns can use a stored locale", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const browserLocation = {
    pathname: "/",
    hash: "",
    href: "https://fandom.justlikekatie.com/",
    origin: "https://fandom.justlikekatie.com",
  };
  let storedLocale = "zh-CN";
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: browserLocation,
      localStorage: {
        getItem: key => key === LOCALE_PREFERENCE_KEY ? storedLocale : null,
        setItem: (key, value) => { if (key === LOCALE_PREFERENCE_KEY) storedLocale = value; },
      },
    },
  });
  try {
    assert.equal(getLocalePreference(), "zh-CN");
    assert.equal(getLocale(), "en");
    assert.equal(getLocale("/vibe-atlas"), "en");
    assert.equal(getLocale("/c-drama-fandom/trope-decoder/"), "en");
    assert.equal(getLocale("/auth/verify"), "zh-CN");
    assert.equal(getLocale("/auth/verify", "en"), "en");
    browserLocation.pathname = "/auth/verify";
    browserLocation.hash = "#token=private&locale=en";
    assert.equal(getLocale(), "en");
    browserLocation.hash = "#token=private&locale=invalid";
    assert.equal(getLocale(), "zh-CN");
    assert.equal(getLocale("/zh-cn/"), "zh-CN");
    assert.equal(translate("English", "简体中文"), "简体中文");
    setLocalePreference("en");
    assert.equal(getLocalePreference(), "en");
    storedLocale = "zh-TW";
    assert.equal(getLocalePreference(), "en");
    assert.equal(
      localizedPath(
        "https://fandom.justlikekatie.com/vibe-atlas?view=builder&handoff-preview=1#token=secret",
        CHINESE_LOCALE,
      ),
      "https://fandom.justlikekatie.com/zh-cn/vibe-atlas?view=builder",
    );
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});