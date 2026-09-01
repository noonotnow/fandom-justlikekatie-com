---
name: Image safety before promise scoring
description: Ordering and diagnostic boundary between image-safety rejection and editorial promise evaluation.
---

**Rule:** Image-safety gates must reject composites and unusable images before any editorial promise evidence is computed. Composite fixtures should include real collage, split-panel, contact-sheet, and text-heavy composite shapes alongside clean single-frame and one-frame text-overlay controls.

**Why:** Computing promise evidence first lets an unsafe multi-frame thumbnail look editorially strong and makes failures appear to be promise problems instead of image-safety problems. Real search thumbnails also expose joins that synthetic guttered grids do not.

**How to apply:** When changing image analysis or curation, preserve null promise diagnostics on safety-rejected candidates, a specific composite rejection reason, and accepted clean controls. Keep visual fixture expectations strict enough to catch both false negatives and false positives.