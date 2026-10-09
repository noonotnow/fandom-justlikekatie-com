# Chinese cast-name glyph availability review

Checked October 7, 2026. This is a font-availability diagnosis, not a cast-copy,
spoiler-boundary, or Untamed table-layout review.

## Decision

The Chinese text is correct. The unmodified guide relies entirely on system
fallback for Chinese glyphs. Its missing boxes in Nix are an environment
limitation, **but the same limitation affects any reader whose browser has no
usable Chinese font**. This is not evidence of a defect on ordinary iOS,
Android, Windows, or macOS installations, nor evidence about affected traffic.

Recommend a small, separately approved shared-CSS fallback release. Do not
change cast text, aliases, credits, table markup, or publication permissions.
No public files were changed and nothing was deployed during this review.

## Source and live parity

- Local source: `public/c-dramas/love-between-fairy-and-devil/cast/index.html`.
- Shared stylesheet: `public/c-drama-fandom/styles.css`.
- The live custom-domain cast article's `<main>` exactly matched local source.
  Full-document equality is not required for hosting-provider script injection.
- Live stylesheet SHA-256 matched local source:
  `0f9bbc444c3a7f01dd9acc3d04e454d9b9d8e8decbc7c55df4096a50657a9027`.
- The already published `public/fonts/vibe-atlas-cjk.woff2` also matched the live
  font byte-for-byte:
  `eb385eca10dd39caff881c38338aefccecfaec6b42cc016fbe81434e388d6c3a`.
- The shared stylesheet contains no `@font-face` or Chinese webfont import.
  Merely having the font on the server cannot supply missing system glyphs.
- The external screenshot browser displayed the live eyebrow's Chinese title
  correctly without an override. That service is a different environment and
  does not identify a physical device or prove cast-table glyph coverage.

## Controlled browser results

Desktop: 1440×1000. Phone-sized: 390×844. Chromium, Firefox and WebKit were run
in Linux at both widths, for 18 engine/viewport/font combinations.

| Font condition | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| Unmodified guide; no native Chinese font | Missing boxes | Missing hexboxes | Missing boxes |
| Unmodified guide; native Noto Sans SC TTF available | Readable | Readable* | Readable |
| No native Chinese font; proposed CSS injected only into test page | Readable | Readable | Readable |

Each combination checked 45 Chinese glyph instances covering all fourteen
character/performer names, the Chinese drama title, and Chinese text in the
explanatory paragraphs. Original article text was asserted unchanged.
Chromium's platform-font report identified three Chinese glyphs in the first
cell as non-custom Noto Sans SC in native mode, and as the custom self-hosted
Noto face in proposal mode. The original Latin bold face remained unchanged.
Screenshots confirm actual glyph ink, rather than relying on text content,
font-family strings, or `document.fonts.ready`.

The raster missing-glyph control matched all 45 Chinese instances in fontless
Chromium and WebKit. Firefox's hexboxes encode each missing code point, so
zero matches to one generic control does **not** mean readable Chinese.
The diagnostic additionally requires every native/proposal Chinese raster to
differ from its own fontless baseline, and visual inspection confirms the
interpretation.

*Firefox initially could not read the temporary native font directory through
its Linux content sandbox, despite `fc-list` seeing the font. The native-font
comparison used `MOZ_DISABLE_CONTENT_SANDBOX=1` only for that diagnostic
process. No app or browser-helper security setting was changed. The webfont
proposal works with the normal sandbox.

### Evidence limits

These are desktop and phone-sized **viewport tests**, not physical-device
tests or native Safari/iOS certification. Adding Noto via isolated fontconfig
represents actual native font availability on Linux, not an emulated Apple or
Android font stack. No real reader reports or audience OS/font data were
available. Physical iPhone/Android and Windows/macOS checks remain a separate
confirmation; do not present these results as those checks.

## Narrow fallback proposal (not applied)

Reuse the existing OFL-licensed font, with a dedicated family such as
`"Guide CJK"` in the shared editorial stylesheet. Limit it to CJK code points
and use `font-display: swap`. Put it **after** the explicit native/brand families
but **before** generic `sans-serif`, `monospace`, or `serif`.

The diagnostic injects:

```css
@font-face {
  font-family: "Guide CJK";
  src: url("/fonts/vibe-atlas-cjk.woff2") format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
  unicode-range: U+3000-303F, U+3400-4DBF, U+4E00-9FFF, U+FF00-FFEF;
}
body {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system,
    BlinkMacSystemFont, "Segoe UI", "Guide CJK", sans-serif;
}
.eyebrow {
  font-family: ui-monospace, SFMono-Regular, Menlo, "Guide CJK", monospace;
}
```

This is the minimum tested scope for all visible Chinese text in this guide.
Do not globally force the Noto face, reuse unrelated brand aliases, or assume
body inheritance covers explicit serif/monospace font shorthands. If broader
shared-guide coverage is approved, append this family to the existing
CJK-bearing explicit stacks while preserving Latin fonts and exact weights.

The existing asset is 1,141,536 bytes (about 1.09 MiB), so reuse avoids a new
dependency but has a transfer cost. No preload is needed. A subsequent
implementation should test blocked-font requests and slow loading: Latin
names must remain usable, but Chinese cannot be guaranteed if both native
fonts and the webfont are unavailable. A full-repertoire font is safer than a
cast-only subset in a shared stylesheet, which could omit other guide names.

Release only the approved stylesheet change from the current production
baseline; the font already exists publicly. Do not rebuild or republish
unrelated workspace drafts.

## Reproduction

`scripts/check-cast-glyphs.ts` serves the unmodified public files on an ephemeral
local port. External analytics requests are blocked. All overrides are confined
to proposal mode in the test browser. JSON and cast-table screenshots go to
`/tmp/cast-font-audit` by default.

Prepare a native TTF/OTF directory (used here: official Noto Sans SC variable
TTF from `notofonts/noto-cjk`, `Sans/Variable/TTF/Subset/NotoSansSC-VF.ttf`).
Do not install it globally: baseline and proposal require `fc-list :lang=zh`
to report no native Chinese fonts.

```sh
node --import tsx/esm scripts/check-cast-glyphs.ts baseline
MOZ_DISABLE_CONTENT_SANDBOX=1 CJK_NATIVE_FONT_DIR=/tmp/cast-font-audit/native \
  node --import tsx/esm scripts/check-cast-glyphs.ts native
node --import tsx/esm scripts/check-cast-glyphs.ts proposal
```

Native mode writes a separate fontconfig file including the system config and
the supplied font directory; it does not modify system configuration. Run
baseline first: the other modes require its per-character raster evidence.
