---
name: C-drama MemeForge intent
description: Preserve conversational creative intent and independent joke/image refinement.
---

The creator wants actual memes: a full-bleed clean still with the setup over the top and the punchline over the bottom in heavy white, dark-outlined type. No parchment frame, kicker, or watermark. This is the shared `renderMemeCanvas` look (`src/utils/memeCanvas.ts`).

**Why:** The creator loves the C-drama aesthetic "entirely" and asked for Middle-earth reaction memes to use it too, along with C-drama's three-angle joke picker.

**How to apply:** Every new meme made from a clean still, in either studio, uses `renderMemeCanvas` for both preview and download. The outline only adds contrast; it cannot hide captions already in an image, so the Middle-earth "Rework meme" path keeps its solid cover-band renderer and "Keep original" stays byte-for-byte.

The tool must understand the creator's own conversational description, preserve the specific performed behavior that they find funny, and allow independent image and wording refinement.

**Why:** The creator described a caught villain's theatrical defense monologue; generic “dramatic female reaction” searching flattened the intent, and losing the joke while finding an image made the result unusable. They explicitly identified needing an assistant to translate their intent into tool jargon as a product failure.

**How to apply:** Treat source/scene anchors in the original thought as meaningful. Do not force unrelated comedy categories or require better prompting. Image hunting must not rewrite jokes, and new wording must be an explicit choice rather than erase the current meme.
