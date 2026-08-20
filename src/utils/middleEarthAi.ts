import type {
  AestheticName,
  ArtifactType,
  MemeFlavorName,
} from '../data/middleEarthCreativeGrammar';

export const MIDDLE_EARTH_AI_URL = '/api/middle-earth-ai';

export interface MiddleEarthAiSource {
  title: string;
  sourceUrl: string;
  publisher?: string;
  query?: string;
}

export interface GeneratedVisualObject {
  title: string;
  primaryText: string;
  secondaryText: string;
  layout: 'Classic top / bottom' | 'Editorial caption' | 'Tiny confession';
  rationale: string;
  translation: {
    scene: string;
    archetype: string;
    vibe: string;
  };
  model?: string;
}

export interface GeneratedRednoteCopy {
  title: string;
  caption: string;
  tags: string[];
  model?: string;
}

export interface GeneratedMemeTranslation {
  translatedMoment: string;
  scene: string;
  character: string;
  memeFlavor: MemeFlavorName;
  aesthetic: AestheticName;
  artifactType: ArtifactType;
  tone: string;
  visualDirection: string;
  searchQuery: string;
  model?: string;
}

interface VisualInput {
  moment?: string;
  character?: string;
  memeFlavor?: MemeFlavorName;
  aesthetic?: AestheticName;
  artifactType?: ArtifactType;
  tone: string;
  layout: string;
  guidance?: string;
  source?: MiddleEarthAiSource;
}

interface TranslationInput {
  moment: string;
  character?: string;
  memeFlavor?: MemeFlavorName;
  aesthetic?: AestheticName;
  artifactType?: ArtifactType;
  guidance?: string;
}

interface RednoteInput extends VisualInput {
  visual: {
    title: string;
    primaryText: string;
    secondaryText?: string;
    layout: string;
  };
  currentCopy?: {
    title?: string;
    caption?: string;
    tags?: string[];
  };
}

export interface MiddleEarthGroundingInput {
  moment?: string;
  character?: string;
  memeFlavor?: MemeFlavorName;
  aesthetic?: AestheticName;
  artifactType?: ArtifactType;
  tone: string;
  layout: string;
  guidance?: string;
  source?: MiddleEarthAiSource & { id?: string };
  visual: {
    title: string;
    primaryText: string;
    secondaryText?: string;
  };
}

export function middleEarthGroundingFingerprint(input: MiddleEarthGroundingInput): string {
  return JSON.stringify({
    moment: input.moment?.trim() || '',
    character: input.character?.trim() || '',
    memeFlavor: input.memeFlavor?.trim() || '',
    aesthetic: input.aesthetic?.trim() || '',
    artifactType: input.artifactType?.trim() || '',
    tone: input.tone.trim(),
    layout: input.layout.trim(),
    guidance: input.guidance?.trim() || '',
    source: input.source ? {
      id: input.source.id || '',
      title: input.source.title.trim(),
      sourceUrl: input.source.sourceUrl.trim(),
      publisher: input.source.publisher?.trim() || '',
      query: input.source.query?.trim() || '',
    } : null,
    visual: {
      title: input.visual.title.trim(),
      primaryText: input.visual.primaryText.trim(),
      secondaryText: input.visual.secondaryText?.trim() || '',
    },
  });
}

export async function generateVisualObject(input: VisualInput): Promise<GeneratedVisualObject> {
  return requestGeneration<GeneratedVisualObject>({ mode: 'visual', ...input });
}

export async function translateMemeMoment(input: TranslationInput): Promise<GeneratedMemeTranslation> {
  return requestGeneration<GeneratedMemeTranslation>({ mode: 'translation', ...input });
}

export async function generateRednoteCopy(input: RednoteInput): Promise<GeneratedRednoteCopy> {
  return requestGeneration<GeneratedRednoteCopy>({ mode: 'rednote', ...input });
}

async function requestGeneration<T>(input: Record<string, unknown>): Promise<T> {
  const response = await fetch(MIDDLE_EARTH_AI_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new Error(stringField(body, 'error') || `MemeForge AI returned HTTP ${response.status}.`);
  }
  const result = body && typeof body === 'object' ? Reflect.get(body, 'result') : null;
  if (!result || typeof result !== 'object') {
    throw new Error('MemeForge AI returned an invalid result.');
  }
  return result as T;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`MemeForge AI returned invalid JSON (HTTP ${response.status}).`);
  }
}

function stringField(value: unknown, field: string): string {
  if (!value || typeof value !== 'object') return '';
  const candidate = Reflect.get(value, field);
  return typeof candidate === 'string' ? candidate : '';
}
