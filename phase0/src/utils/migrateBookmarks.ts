import { dbSaveCard } from './collectionDB';

const MIGRATION_KEY = 'vibe-atlas-bookmarks-migrated';

/**
 * One-time migration: move any legacy localStorage bookmarks
 * into the IndexedDB collection store.
 */
export async function migrateBookmarks(): Promise<void> {
  if (localStorage.getItem(MIGRATION_KEY)) return;

  try {
    const raw = localStorage.getItem('vibe-atlas-bookmarks');
    if (!raw) {
      localStorage.setItem(MIGRATION_KEY, '1');
      return;
    }

    const bookmarks: string[] = JSON.parse(raw);
    for (const imageUrl of bookmarks) {
      await dbSaveCard({
        imageUrl,
        thumbnailUrl: imageUrl,
        actor: 'Unknown',
        actorEn: 'Unknown',
        vibe: 'Unknown',
        vibeEn: 'Unknown',
        vibeEmoji: '✨',
        capturedDate: new Date().toISOString().split('T')[0],
      });
    }

    localStorage.setItem(MIGRATION_KEY, '1');
  } catch {
    // Silently skip if migration fails — user can still save new cards
  }
}
