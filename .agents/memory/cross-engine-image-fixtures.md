---
name: Cross-engine image fixtures
description: Validate tiny image fixtures before diagnosing browser-specific export failures.
---

Use structurally valid image bytes for cross-engine canvas/export fixtures, even when Chromium displays a copied base64 pixel.

**Why:** A tiny PNG with an invalid IDAT CRC passed Chromium/WebKit checks but failed repeated Firefox image loads during export. That looked like a share failure until the image-loading error was examined.

**How to apply:** Validate PNG chunk checksums or use a simple self-contained SVG for fixtures that do not specifically test PNG decoding. Preserve real image loading and canvas export rather than mocking those paths to hide decoding failures.
