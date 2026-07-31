import type { StarOfDayData } from '../hooks/useStarOfDay';
import type { GridItemData, ImageTier } from '../types';
import type { CardMetadata } from './cardRenderer';

export const DEFAULT_PLAN_URL = 'https://plan.justlikekatie.com/api/drafts';
export const DEFAULT_MEDIA_UPLOAD_URL = 'https://xhs.justlikekatie.com/api/integrations/media';
export const VIBE_ATLAS_CAMPAIGN = 'Vibe Atlas Rednote Launch';

export interface PlanFormValues {
  headline: string;
  caption: string;
  platform: string;
  series: string;
  scheduledDate?: string;
}

export interface PlanDraftPayload {
  headline: string;
  caption: string;
  captionSeed?: string;
  ctaSeed?: string;
  platform: string;
  series: string;
  scheduledDate?: string;
  status: 'Draft';
  origin: 'Automated';
  campaign: string;
  event: string;
  actor: string;
  actorEn: string;
  actorId: string;
  vibe: string;
  vibeEn: string;
  mediaUrl?: string;
  mediaUploadStatus: 'attached' | 'upload_failed';
  mediaError?: string;
  provenance: {
    sourceUrl: string;
    sourceImageUrl?: string;
    sourceContentUrl?: string;
    itemId: string;
    batchKey?: string;
    cardId: string;
    gridId: string;
    gridPosition: number;
    actorId: string;
    actorName: string;
    generatedAt: string;
    prompt?: string;
    query?: string;
  };
  requirements: string;
}

interface BuildPayloadOptions {
  data: StarOfDayData;
  image: GridItemData;
  form: PlanFormValues;
  sourceUrl: string;
  generatedAt: string;
  mediaUrl?: string;
  uploadError?: string;
}

export interface UploadResult {
  url: string;
}

export interface DraftResult {
  ok: boolean;
  id: string;
}

type Fetch = typeof fetch;
type CardRenderer = (metadata: CardMetadata) => Promise<Blob>;
type MediaUploader = (
  blob: Blob,
  token: string,
  uploadUrl?: string,
  fetchImpl?: Fetch,
) => Promise<UploadResult>;

export function isDurablePublicUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:'
      && !url.username
      && !url.password
      && isPublicHostname(url.hostname)
    );
  } catch {
    return false;
  }
}

export function buildPlanDraftPayload({
  data,
  image,
  form,
  sourceUrl,
  generatedAt,
  mediaUrl,
  uploadError,
}: BuildPayloadOptions): PlanDraftPayload {
  if (mediaUrl && !isDurablePublicUrl(mediaUrl)) {
    throw new Error('Media upload returned a temporary or invalid URL');
  }

  const gridId = `vibe-atlas-${data.date}-${data.actorId}`;
  const gridPosition = image.gridPosition ?? 0;
  const cardId = `${gridId}-card-${gridPosition}-${stableId(image.id)}`;
  const captionSeed = data.vibeSubtitle.trim() || undefined;
  const ctaSeed = data.ctaSeed?.trim() || undefined;
  const generationPrompt = data.generationPrompt?.trim() || undefined;
  const generationQuery = data.generationQuery?.trim()
    || data.rankedBatches[0]?.query?.trim()
    || undefined;
  const mediaUploadStatus = mediaUrl ? 'attached' : 'upload_failed';
  const requirements = mediaUrl
    ? 'Media attached: generated Vibe Atlas share card.'
    : `Needs media: share-card upload failed${uploadError ? ` — ${uploadError}` : ''}`;

  return {
    headline: form.headline.trim(),
    caption: form.caption.trim(),
    ...(captionSeed ? { captionSeed } : {}),
    ...(ctaSeed ? { ctaSeed } : {}),
    platform: form.platform,
    series: form.series,
    ...(form.scheduledDate ? { scheduledDate: form.scheduledDate } : {}),
    status: 'Draft',
    origin: 'Automated',
    campaign: VIBE_ATLAS_CAMPAIGN,
    event: VIBE_ATLAS_CAMPAIGN,
    actor: data.actorName,
    actorEn: data.actorShortNameEn,
    actorId: data.actorId,
    vibe: data.vibeLabel,
    vibeEn: data.vibeLabelEn,
    ...(mediaUrl ? { mediaUrl } : {}),
    mediaUploadStatus,
    ...(uploadError ? { mediaError: uploadError } : {}),
    provenance: {
      sourceUrl,
      ...(isDurablePublicUrl(image.id) ? { sourceImageUrl: image.id } : {}),
      ...(isDurablePublicUrl(image.url) ? { sourceContentUrl: image.url } : {}),
      itemId: image.id,
      ...(image.batchKey ? { batchKey: image.batchKey } : {}),
      cardId,
      gridId,
      gridPosition,
      actorId: data.actorId,
      actorName: data.actorName,
      generatedAt: data.generatedAt || generatedAt,
      ...(generationPrompt ? { prompt: generationPrompt } : {}),
      ...(generationQuery ? { query: generationQuery } : {}),
    },
    requirements,
  };
}

export async function uploadSelectedCard(
  image: GridItemData,
  data: StarOfDayData,
  tier: ImageTier,
  render: CardRenderer,
  token: string,
  uploadUrl = DEFAULT_MEDIA_UPLOAD_URL,
  upload: MediaUploader = uploadShareCard,
): Promise<UploadResult> {
  const blob = await render({
    actorName: data.actorName,
    vibeEmoji: data.vibeEmoji,
    vibeLabel: data.vibeLabel,
    vibeLabelEn: data.vibeLabelEn,
    date: data.date,
    imageUrl: image.thumbnail,
    accentColor: data.actorAccentColor,
    tier,
  });
  return upload(blob, token, uploadUrl);
}

export async function uploadShareCard(
  blob: Blob,
  token: string,
  uploadUrl = DEFAULT_MEDIA_UPLOAD_URL,
  fetchImpl: Fetch = fetch,
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', new File([blob], 'vibe-atlas-share-card.png', { type: 'image/png' }));

  const response = await fetchImpl(uploadUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(stringField(body, 'error') || `Share-card upload failed (HTTP ${response.status})`);
  }

  const url = stringField(body, 'url');
  if (!url || !isDurablePublicUrl(url)) {
    throw new Error('Share-card upload did not return a durable public URL');
  }
  return { url };
}

export async function sendPlanDraft(
  payload: PlanDraftPayload,
  token: string,
  planUrl = DEFAULT_PLAN_URL,
  fetchImpl: Fetch = fetch,
): Promise<DraftResult> {
  const response = await fetchImpl(planUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(stringField(body, 'error') || `PLAN draft creation failed (HTTP ${response.status})`);
  }

  const id = stringField(body, 'id');
  if (!id) throw new Error('PLAN created a draft without returning its ID');
  return { ok: true, id };
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to generate the Vibe Atlas share-card PNG'));
    }, 'image/png');
  });
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Endpoint returned invalid JSON (HTTP ${response.status})`);
  }
}

function stringField(value: unknown, field: string): string {
  if (!value || typeof value !== 'object') return '';
  const candidate = Reflect.get(value, field);
  return typeof candidate === 'string' ? candidate : '';
}

function stableId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function isPublicHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
    || (
      normalized.includes(':')
      && (
        normalized === '::1'
        || normalized.startsWith('fc')
        || normalized.startsWith('fd')
        || normalized.startsWith('fe8')
        || normalized.startsWith('fe9')
        || normalized.startsWith('fea')
        || normalized.startsWith('feb')
      )
    )
  ) {
    return false;
  }

  const octets = normalized.split('.').map(Number);
  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet))) return true;
  const [first, second] = octets;
  return !(
    first === 0
    || first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
  );
}
