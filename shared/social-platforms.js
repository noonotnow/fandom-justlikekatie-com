/**
 * One definition of each social platform the fandom tools talk about.
 *
 * This is a vocabulary, not an accepted set. Each surface (CREATE grid
 * handoff, daily-drop channels, meme send, the MemeForge share kit) declares
 * its own allowlist with `platformAllowlist`, which only checks that every id
 * exists here. Adding a platform to the vocabulary therefore never widens what
 * any surface accepts; a surface changes only when its own list changes.
 */
export const SOCIAL_PLATFORMS = Object.freeze({
  rednote: Object.freeze({ id: "rednote", label: "Rednote" }),
  weibo: Object.freeze({ id: "weibo", label: "Weibo" }),
  instagram: Object.freeze({ id: "instagram", label: "Instagram" }),
  tiktok: Object.freeze({ id: "tiktok", label: "TikTok" }),
});

export const SOCIAL_PLATFORM_IDS = Object.freeze(Object.keys(SOCIAL_PLATFORMS));

export function isSocialPlatformId(value) {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SOCIAL_PLATFORMS, value);
}

/** Declares a surface's accepted platforms, in its own order. Throws at import on an unknown id. */
export function platformAllowlist(ids) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error("A platform allowlist needs at least one platform.");
  for (const id of ids) {
    if (!isSocialPlatformId(id)) throw new Error(`Unknown social platform "${id}". Add it to shared/social-platforms.js first.`);
  }
  if (new Set(ids).size !== ids.length) throw new Error("A platform allowlist cannot repeat a platform.");
  return Object.freeze([...ids]);
}

export function platformLabel(id) {
  return isSocialPlatformId(id) ? SOCIAL_PLATFORMS[id].label : id;
}
