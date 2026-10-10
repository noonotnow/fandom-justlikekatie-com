---
name: CJK canvas review
description: Cross-engine Chinese typography verification and its editorial limits
---

Verify Chinese wrapping and visible glyph ink using real canvas renders in each
available browser engine, not only a mocked measureText implementation or a
Chromium screenshot. Closing punctuation must remain attached to preceding text
when a valid break exists.

**Why:** A wrapping implementation and assertion that looked correct in Chromium
still stranded closing punctuation in WebKit because the font measurements
changed where the line broke. Correct share title/text also must not lead tests
to reject the intentional attached image file.

**How to apply:** For export typography changes, assert text bounds, encoded
image dimensions, visible CJK ink and punctuation behavior alongside the file
sharing contract. Treat these as functionality checks, never as native-speaker
approval of transcreated Chinese humor.

UI font matching also needs real glyph checks, not only computed family names
or document.fonts.ready. CJK-only alias faces must match the exact weights used
by existing Latin faces; a broad variable-weight range can lose to an existing
exact-weight Latin face and leave headings or navigation with system tofu.

**Why:** Core display headings and monospace labels rendered boxes on a browser
without system CJK fonts while the localized body and canvas export tests passed.

**How to apply:** Check display and navigation glyphs at each supported weight
against the local CJK font in all browser engines, then visually inspect the
mobile UI. Keep Latin glyphs on their original brand faces.

Attribution boundary fixtures must use the renderer's actual locale prefix and
font stack. Keep any glyph under test early enough in the source fixture to
survive intentional truncation; do not rely on a translated label to supply it.

**Why:** Switching from a bilingual footer to an English-only source label
exposed tests that accidentally measured a Chinese prefix or counted its glyphs
instead of testing the source text. CJK fallbacks also change measured widths.

**How to apply:** Measure the real prefix and font for boundary fixtures; retain
independent bounds, grapheme and contrast assertions rather than updating them
to hide a rendering defect.