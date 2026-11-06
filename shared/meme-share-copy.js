/**
 * Platform-owned post-copy contracts for the MemeForge share kit.
 *
 * A lens (C-drama, Middle-earth...) shapes the joke and supplies topic tags.
 * A platform owns what a post is made of: its fields, length limits, hashtag
 * bounds and writing guidance. Nothing here knows about a lens, and no lens
 * decides which platform a meme goes to.
 *
 * The Rednote contract mirrors the limits the Middle-earth Rednote writer has
 * always used (120 / 2200 / 3-8 tags); its AI prompt is pinned by a golden
 * fixture so this refactor cannot change Rednote output.
 */
import { platformAllowlist, platformLabel } from "./social-platforms.js";

/** Platforms the share kit offers, in display order. */
export const SHARE_KIT_PLATFORMS = platformAllowlist(["rednote", "tiktok", "instagram"]);

export const SHARE_TAG_PATTERN = /^#[^\s#,]{1,49}$/u;
export const MAX_SHARE_TAG_BODY = 49;

export const SHARE_COPY_CONTRACTS = Object.freeze({
  rednote: Object.freeze({
    platform: "rednote",
    writerName: "Rednote (小红书)",
    postName: "Rednote",
    fields: Object.freeze([
      Object.freeze({ key: "title", label: "Rednote title", maxLength: 120, required: true, placeholder: "A scroll-stopping title" }),
      Object.freeze({ key: "caption", label: "Rednote caption", maxLength: 2200, required: true, multiline: true, placeholder: "The editable caption draft will appear here." }),
    ]),
    tags: Object.freeze({ min: 3, max: 8 }),
    guidance: Object.freeze([]),
  }),
  tiktok: Object.freeze({
    platform: "tiktok",
    writerName: "TikTok",
    postName: "TikTok",
    fields: Object.freeze([
      Object.freeze({ key: "hook", label: "TikTok hook", maxLength: 125, required: true, placeholder: "The first line people read" }),
      Object.freeze({ key: "caption", label: "TikTok caption", maxLength: 2200, required: true, multiline: true, placeholder: "Usually just the joke" }),
    ]),
    tags: Object.freeze({ min: 0, max: 5 }),
    guidance: Object.freeze([
      "The hook is the first line people read: one punchy line, ideally under 80 characters.",
      "The caption is mostly the joke itself. Keep it under 300 characters; no essay, no call to follow.",
      "Hashtags are optional on TikTok. Use only a few that people actually search.",
    ]),
  }),
  instagram: Object.freeze({
    platform: "instagram",
    writerName: "Instagram",
    postName: "Instagram",
    fields: Object.freeze([
      Object.freeze({ key: "caption", label: "Instagram caption", maxLength: 2200, required: true, multiline: true, placeholder: "Setup and punchline, in your voice" }),
    ]),
    tags: Object.freeze({ min: 0, max: 10 }),
    guidance: Object.freeze([
      "Lead with the joke in the first line; Instagram truncates long captions after about 125 characters.",
      "Keep the whole caption short and conversational, under 500 characters.",
      "Hashtags go at the end. A few specific ones beat many generic ones.",
    ]),
  }),
});

export function shareCopyContract(platform) {
  const contract = SHARE_COPY_CONTRACTS[platform];
  if (!contract) throw new Error(`No share-copy contract for "${platform}".`);
  return contract;
}

/** Normalizes one tag the same way the Rednote writer always has: #prefix, no spaces/commas, lowercase. */
export function normalizeShareTag(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let tag = raw.trim();
  if (!tag.startsWith("#")) tag = `#${tag}`;
  tag = `#${tag.slice(1).replace(/[\s,]+/g, "").toLowerCase()}`.slice(0, 1 + MAX_SHARE_TAG_BODY);
  return SHARE_TAG_PATTERN.test(tag) ? tag : null;
}

/** Splits free text ("#a #b, c") into tags without changing their case; the UI keeps what was typed. */
export function parseShareTags(text) {
  return String(text ?? "")
    .split(/[\s,]+/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => (part.startsWith("#") ? part : `#${part}`));
}

/**
 * Free, instant default copy for any platform from the joke and the lens's
 * topic tags. For TikTok and Instagram this reproduces C-drama's original
 * template exactly (hook = setup, TikTok caption = punchline, Instagram
 * caption = setup + newline + punchline).
 */
export function templateShareCopy(platform, joke, topicTags) {
  const contract = shareCopyContract(platform);
  const setup = String(joke?.setup ?? "").trim();
  const punchline = String(joke?.punchline ?? "").trim();
  const stacked = `${setup}\n${punchline}`;
  const fields = platform === "rednote"
    ? { title: (setup || punchline).slice(0, 120), caption: stacked }
    : platform === "tiktok"
      ? { hook: setup, caption: punchline }
      : { caption: stacked };
  return { fields, tags: [...(topicTags ?? [])].slice(0, contract.tags.max) };
}

/** Returns a short problem description, or null when the copy meets the platform contract. */
export function shareCopyProblem(platform, copy) {
  const contract = shareCopyContract(platform);
  for (const field of contract.fields) {
    const value = String(copy?.fields?.[field.key] ?? "");
    if (field.required && !value.trim()) return `${field.label} is empty.`;
    if (value.length > field.maxLength) return `${field.label} is over ${field.maxLength} characters.`;
  }
  const tags = Array.isArray(copy?.tags) ? copy.tags : [];
  if (tags.length < contract.tags.min) return `${platformLabel(platform)} posts need at least ${contract.tags.min} hashtags.`;
  if (tags.length > contract.tags.max) return `${platformLabel(platform)} posts use at most ${contract.tags.max} hashtags.`;
  return null;
}

/** The text a creator pastes into the platform. */
export function formatSharePost(platform, copy) {
  const contract = shareCopyContract(platform);
  const parts = contract.fields.map(field => String(copy?.fields?.[field.key] ?? "").trim()).filter(Boolean);
  const tags = (copy?.tags ?? []).join(" ").trim();
  return [...parts, tags].filter(Boolean).join("\n\n");
}
