# QA Bug Report: Mobile Issues (2026-07-03)

**Reporter:** Katie (Mobile QA)  
**Date:** 2026-07-03  
**Severity:** Medium (UX quality)

---

## Issue 1: Sina Logo Goblin in Batch 2

### Context
- **Today's Star:** 王鹤棣
- **Batch 2 Query:** 王鹤棣 综艺 表情包
- **Platform:** Mobile

### Problem
The preview grid surfaced a **standalone Sina logo/placeholder tile** as if it were an image result. This is a retrieval artifact (source logo/placeholder) and not useful user-facing content.

### Observed Behavior
- One useful `ent.sina.cn`-style result ✓
- One Sina logo/placeholder tile (artifact) ✗

### Expected Behavior
- Filter out obvious source-logo and placeholder tiles
- Preserve real Sina entertainment/image results from `sina.cn` / `ent.sina.cn`
- Backfill preview grid with next best available result

### Patch Strategy
Add filtering for obvious source-logo/placeholder tiles in the image preview grid:

**Detection rules:**
- If thumbnail/image appears to be a site logo rather than content → filter
- If image title/alt/URL contains markers like: `logo`, `sina logo`, `favicon`, `site logo` → filter
- If image dimensions/aspect/metadata suggest generic site logo or placeholder → filter

**Preservation:**
- ⚠️ Do NOT broadly block all Sina domains
- Real `sina.cn` / `ent.sina.cn` content results should still appear
- Only filter obvious logo/placeholder assets

### Acceptance Criteria
- [ ] Batch 2 no longer shows standalone Sina logo tile
- [ ] Real Sina entertainment/image results still appear
- [ ] Preview grid backfills with next best result (no empty slots)

---

## Issue 2: Button Helper Text Contrast (Weibo / Baidu)

### Context
- **Affected Buttons:** 微博搜图 (Search Weibo) and 百度图片 (Baidu Images)
- **Platform:** Mobile

### Problem
English helper text under colored launcher buttons has **insufficient contrast** against dark/saturated backgrounds. Text is too dim to read on mobile.

### Current State
- 微博搜图 button: Red background + dark helper text (hard to read)
- 百度图片 button: Blue background + dark helper text (hard to read)

### Expected Behavior
Helper text should be **readable on colored button backgrounds** on mobile devices.

### Patch Strategy
Make English helper text white or near-white inside dark/saturated colored buttons:

**CSS Change:**
```css
/* Helper text color for colored launcher buttons */
color: #ffffff;
/* or */
color: rgba(255, 255, 255, 0.88);
```

**Constraints:**
- Keep Chinese label prominent
- Ensure WCAG AA contrast ratio
- Test on mobile devices

### Acceptance Criteria
- [ ] "Search Weibo" is readable on red button
- [ ] "Baidu Images" is readable on blue button
- [ ] Contrast visibly improved in mobile screenshots
- [ ] WCAG AA contrast standard met

---

## QA Verdict
**Valid bug class.** The app is now retrieving real content, which means filtering for logo goblins and fixing contrast issues are the next priorities. Progress.

---

## Next Steps
1. ✓ Issue created (paper trail started)
2. ⏳ Awaiting approval before implementation
3. → Create fix PR referencing this issue
4. → Mobile QA verification before merge
