export type MemeForgeCreationPath = 'reaction-card' | 'meme-rework';
export type MemeReworkEditMode = 'cover-and-replace' | 'add-overlay';

export interface MemeReworkSource {
  resultId: string;
  title: string;
  sourceUrl?: string;
  publisher?: string;
  searchQuery?: string;
  provider?: string;
  sourceType: 'archive' | 'upload';
}

export interface MemeReworkMetadata {
  schemaVersion: 1;
  kind: 'meme-rework';
  createdAt: string;
  original: MemeReworkSource;
  edit: {
    type: 'text-overlay';
    mode: MemeReworkEditMode;
    line1?: string;
    line2?: string;
    footer?: string;
    layout: string;
    tone: string;
  };
}

export function createMemeReworkMetadata(
  source: {
    id: string;
    title: string;
    url: string;
    publisher?: string;
    query?: string;
    provider?: string;
    sourceType?: 'archive' | 'upload';
  },
  edit: {
    mode: MemeReworkEditMode;
    line1?: string;
    line2?: string;
    footer?: string;
    layout: string;
    tone: string;
  },
  now = new Date(),
): MemeReworkMetadata {
  const line1 = edit.line1?.trim();
  const line2 = edit.line2?.trim();
  if (!line1 && !line2) {
    throw new Error('Add at least one replacement or overlay line before saving a rework.');
  }
  const isUpload = source.sourceType === 'upload'
    || source.provider === 'local-upload'
    || source.url.startsWith('data:');
  return {
    schemaVersion: 1,
    kind: 'meme-rework',
    createdAt: now.toISOString(),
    original: {
      resultId: source.id,
      title: source.title.trim() || 'Existing Middle-earth meme',
      ...(!source.url.startsWith('data:') && source.url.trim() ? { sourceUrl: source.url.trim() } : {}),
      ...(source.publisher?.trim() ? { publisher: source.publisher.trim() } : {}),
      ...(source.query?.trim() ? { searchQuery: source.query.trim() } : {}),
      ...(source.provider?.trim() ? { provider: source.provider.trim() } : {}),
      sourceType: isUpload ? 'upload' : 'archive',
    },
    edit: {
      type: 'text-overlay',
      mode: edit.mode,
      ...(line1 ? { line1 } : {}),
      ...(line2 ? { line2 } : {}),
      ...(edit.footer?.trim() ? { footer: edit.footer.trim() } : {}),
      layout: edit.layout,
      tone: edit.tone,
    },
  };
}