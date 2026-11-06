/**
 * Per-world (lens) settings that are about the creative world, not about
 * where a meme is posted. Topic tags describe the fandom; how many a post
 * uses is decided by the platform contract in shared/meme-share-copy.js.
 */
/** Same ids as `MemeLens` in src/utils/memeLibrary.ts (kept import-free so ESM test builds can load this file). */
export type MemeLens = 'c-drama' | 'middle-earth';

export type MemeLensConfig = {
  id: MemeLens;
  label: string;
  /** Default hashtags for template copy. At least three, so Rednote's 3-tag minimum is met. */
  topicTags: readonly string[];
};

export const MEME_LENSES: Readonly<Record<MemeLens, MemeLensConfig>> = {
  'c-drama': {
    id: 'c-drama',
    label: 'C-drama',
    topicTags: ['#CDrama', '#CDramaFans', '#DramaHumor'],
  },
  'middle-earth': {
    id: 'middle-earth',
    label: 'Middle-earth',
    topicTags: ['#LOTR', '#MiddleEarth', '#LordOfTheRings'],
  },
};
