import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import {
  generateRednoteCopy,
  generateVisualObject,
  middleEarthGroundingFingerprint,
  translateMemeMoment,
  type GeneratedMemeTranslation,
  type MiddleEarthAiSource,
  type MemeCardFormat,
  type ReactionImageBrief,
} from "../../utils/middleEarthAi";
import {
  ideaPacketStagingErrorMessage,
  type MiddleEarthRednoteCopy,
} from "../../utils/ideaPackets";
import {
  aesthetics,
  artifactTypes,
  memeFlavors,
  type AestheticName,
  type ArtifactType,
  type ComicMechanismName,
  type MemeFlavorName,
} from "../../data/middleEarthCreativeGrammar";
import {
  referenceStillFamilies,
  referenceStillFamilyById,
  referenceStillSearchQueries,
  type ReferenceStillFamilyId,
} from "../../data/middleEarthReferenceStills";
import {
  filterReactionCandidates,
  loadableReactionAssets,
  rankReactionCandidates,
  reactionQueryLadder,
  retainReactionEmotionCandidates,
  type ReactionQueryTier,
} from "../../utils/reactionImageAssets";
import { createArchiveSearchRequestGate } from "./archiveSearchRequestGate";
import {
  dbIsCardSaved,
  dbReplaceCardImage,
  dbSaveCard,
  type CardRecord,
} from "../../utils/collectionDB";
import { uploadCollectionImage } from "../../utils/collectionMedia";
import type { MediaReference } from "../../utils/mediaReference";
import {
  createMemeReworkMetadata,
  type MemeReworkEditMode,
} from "../../utils/memeRework";
import {
  getPublicSession,
  schedulePublicCollectionSync,
  shouldSyncCollection,
  syncPublicCollection,
} from "../../utils/publicAccount";
import styles from "./MiddleEarthWorkspace.module.css";

export interface MiddleEarthAsset {
  id: string;
  title: string;
  thumbnail: string;
  url: string;
  publisher?: string;
  query: string;
  provider?: string;
  sourceType?: "archive" | "upload";
  media?: MediaReference;
  collectionLocalId?: string;
  reactionQueryTier?: ReactionQueryTier;
  reactionEmotion?: string;
  reactionEmotions?: string[];
}

export type MiddleEarthContentKind = "meme" | "spellbook";
type ReactionSearchMode = "clean-still" | "existing-meme";
export type MemeSourceTreatment = "new-overlay" | "as-is";
type MemeSourcePath = "new-image" | "rework-existing" | "existing-meme";

export interface MiddleEarthDraft {
  kind: MiddleEarthContentKind;
  title: string;
  text: string;
  secondaryText?: string;
  cardFormat?: MemeCardFormat;
  cardFooter?: string;
  tone: string;
  layout: string;
  character?: string;
  memeFlavor?: string;
  comicMechanism?: ComicMechanismName;
  aesthetic?: string;
  artifactType?: string;
  referenceStillFamily?: ReferenceStillFamilyId;
  referenceStillQuery?: string;
  reactionImageBrief?: ReactionImageBrief;
  creativeDirection?: string;
  aiGeneration?: {
    provider: "xai";
    generatedAt: string;
    model?: string;
  };
  rednoteCopy?: MiddleEarthRednoteCopy;
  creationPath?: "reaction-card" | "meme-rework";
  memeRework?: ReturnType<typeof createMemeReworkMetadata>;
  asset?: MiddleEarthAsset;
  createdAt: string;
}

interface SearchResponse {
  query: string;
  provider?: string;
  results: Array<{
    title: string;
    thumbnail: string;
    link: string;
    source: string;
    provider?: string;
  }>;
}

const suggestions = [
  { label: "Characters", items: ["Gandalf", "Éowyn", "Frodo & Sam"] },
  { label: "Places", items: ["Rivendell", "The Shire", "Moria"] },
  { label: "Artifacts", items: ["The One Ring", "Sting", "Palantír"] },
  { label: "Scenes", items: ["Council of Elrond", "Helm's Deep", "The Grey Havens"] },
  { label: "Moods", items: ["melancholy Middle-earth", "cozy Shire", "ominous Mordor"] },
];

const memeTones = ["Deadpan", "Tender", "Chaotic", "Dramatic"];
const memeLayouts = ["Classic top / bottom", "Editorial caption", "Tiny confession"];
const autoSteering = "Auto / surprise me";
const characterFilters = [
  autoSteering,
  "Boromir",
  "Gandalf",
  "Éowyn",
  "Frodo",
  "Samwise",
  "Aragorn",
  "Galadriel",
  "Legolas",
  "Gimli",
  "Bilbo",
  "Gollum",
  "The Fellowship",
];
const momentExamples = [
  "Not wanting to go to work on Friday",
  "Sam and Frodo funny",
  "Gandalf workplace boundaries",
  "Defending my little treat with my life",
];
const maxUploadedMemeBytes = 8 * 1024 * 1024;

function makeAsset(result: SearchResponse["results"][number], query: string, index: number): MiddleEarthAsset {
  return {
    id: `${query}-${index}-${result.link}`,
    title: result.title,
    thumbnail: result.thumbnail,
    url: result.link,
    publisher: result.source,
    query,
    provider: result.provider,
  };
}

function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string" && reader.result.startsWith("data:image/")) resolve(reader.result);
      else reject(new Error("The selected file could not be read as an image."));
    };
    reader.onerror = () => reject(new Error("The selected meme could not be read. Try another image."));
    reader.readAsDataURL(file);
  });
}

function canLoadReactionImage(url: string, timeoutMs = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(loaded);
    };
    const timeout = window.setTimeout(() => finish(false), timeoutMs);
    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0);
    image.onerror = () => finish(false);
    image.src = url;
  });
}

function drawCanvasImageCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const ratio = Math.max(width / image.width, height / image.height);
  const renderedWidth = image.width * ratio;
  const renderedHeight = image.height * ratio;
  context.drawImage(
    image,
    x + (width - renderedWidth) / 2,
    y + (height - renderedHeight) / 2,
    renderedWidth,
    renderedHeight,
  );
}

function drawCanvasImageContain(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const ratio = Math.min(width / image.width, height / image.height);
  const renderedWidth = image.width * ratio;
  const renderedHeight = image.height * ratio;
  context.drawImage(
    image,
    x + (width - renderedWidth) / 2,
    y + (height - renderedHeight) / 2,
    renderedWidth,
    renderedHeight,
  );
}

function downloadCanvasPng(canvas: HTMLCanvasElement, title: string): void {
  const link = document.createElement("a");
  const filename = (title || "middle-earth-packet")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  link.download = `${filename || "middle-earth-packet"}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function safeDownloadName(value: string): string {
  return (value || "middle-earth-meme")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "middle-earth-meme";
}

export async function downloadExistingMeme(asset: MiddleEarthAsset): Promise<void> {
  const response = await fetch(asset.thumbnail, { credentials: "same-origin" });
  if (!response.ok) throw new Error("The selected meme could not be downloaded. Open the original source instead.");
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error("The selected record did not return an image.");
  const extension = ({
    "image/avif": "avif",
    "image/gif": "gif",
    "image/heif": "heif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/svg+xml": "svg",
    "image/tiff": "tiff",
    "image/webp": "webp",
  } as Record<string, string>)[blob.type] || "img";
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = `${safeDownloadName(asset.title)}.${extension}`;
  link.href = objectUrl;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function drawClassicReactionFrame(
  context: CanvasRenderingContext2D,
  draft: MiddleEarthDraft,
  image: HTMLImageElement | null,
): void {
  const reactionStillFrame = { x: 54, y: 364, width: 972, height: 548 };
  context.fillStyle = "#f4eee2";
  context.fillRect(0, 0, 1080, 1350);
  context.fillStyle = "#193b3b";
  context.fillRect(0, 0, 1080, 26);
  context.fillStyle = "#dfb65b";
  context.fillRect(0, 1324, 1080, 26);

  context.fillStyle = "#193b3b";
  context.fillRect(
    reactionStillFrame.x,
    reactionStillFrame.y,
    reactionStillFrame.width,
    reactionStillFrame.height,
  );
  if (image) {
    drawCanvasImageCover(
      context,
      image,
      reactionStillFrame.x + 6,
      reactionStillFrame.y + 6,
      reactionStillFrame.width - 12,
      reactionStillFrame.height - 12,
    );
  }

  const drawTextBand = (copy: string, y: number, height: number) => {
    const fontSize = 64;
    const lineHeight = 72;
    context.fillStyle = "#193b3b";
    context.textAlign = "center";
    context.font = `700 ${fontSize}px Arial`;
    const lines = wrapCanvasText(context, copy.toUpperCase(), 880).slice(0, 2);
    const blockHeight = lines.length * lineHeight;
    const firstBaseline = y + (height - blockHeight) / 2 + fontSize;
    lines.forEach((line, index) => {
      context.fillText(line, 540, firstBaseline + index * lineHeight);
    });
  };

  context.fillStyle = "#a55439";
  context.textAlign = "center";
  context.font = "600 18px monospace";
  context.fillText("MEMEFORGE // REACTION", 540, 68);
  drawTextBand(draft.text || "YOUR SETUP BELONGS HERE.", 26, 338);
  drawTextBand(draft.secondaryText || "YOUR REACTION BELONGS HERE.", 912, 412);

  if (draft.cardFooter) {
    context.fillStyle = "#a55439";
    context.textAlign = "center";
    context.font = "500 17px monospace";
    context.fillText(draft.cardFooter.toUpperCase().slice(0, 54), 540, 1284);
  }
  context.fillStyle = "#193b3b";
  context.textAlign = "center";
  context.font = "500 16px monospace";
  context.fillText("fandom.justlikekatie.com/memeforge/middle-earth", 540, 1342);
}

function drawMemeReworkFrame(
  context: CanvasRenderingContext2D,
  draft: MiddleEarthDraft,
  image: HTMLImageElement,
): void {
  const frame = { x: 48, y: 126, width: 984, height: 1080 };
  const mode = draft.memeRework?.edit.mode || "cover-and-replace";
  context.fillStyle = "#102d2e";
  context.fillRect(0, 0, 1080, 1350);
  context.fillStyle = "#050707";
  context.fillRect(frame.x, frame.y, frame.width, frame.height);
  drawCanvasImageContain(context, image, frame.x, frame.y, frame.width, frame.height);

  const drawOverlay = (copy: string, top: number, bottom = false) => {
    if (!copy.trim()) return;
    context.font = "800 62px Arial";
    const lines = wrapCanvasText(context, copy.toUpperCase(), 850).slice(0, 2);
    const lineHeight = 68;
    const height = Math.max(132, lines.length * lineHeight + 40);
    const y = bottom ? frame.y + frame.height - height : top;
    context.fillStyle = mode === "cover-and-replace" ? "#050707" : "rgba(5,7,7,.84)";
    context.fillRect(frame.x, y, frame.width, height);
    context.fillStyle = "#fffdf8";
    context.textAlign = "center";
    const firstBaseline = y + (height - lines.length * lineHeight) / 2 + 55;
    lines.forEach((line, index) => context.fillText(line, 540, firstBaseline + index * lineHeight));
  };

  drawOverlay(draft.text, mode === "cover-and-replace" ? frame.y : frame.y + 34);
  drawOverlay(draft.secondaryText || "", frame.y, true);

  context.fillStyle = "#d4a951";
  context.textAlign = "left";
  context.font = "600 18px monospace";
  context.fillText("MEMEFORGE // REWORK", 48, 76);
  context.textAlign = "right";
  context.fillText(mode === "cover-and-replace" ? "COVER + REPLACE" : "ADDED OVERLAY", 1032, 76);
  context.fillStyle = "#f4eee2";
  context.textAlign = "center";
  context.font = "500 16px monospace";
  context.fillText("DERIVATIVE EDIT · ORIGINAL SOURCE PRESERVED", 540, 1260);
  if (draft.title) {
    context.fillStyle = "#d8cdb8";
    context.fillText(draft.title.toUpperCase().slice(0, 70), 540, 1292);
  }
  context.fillStyle = "#d4a951";
  context.fillRect(0, 1324, 1080, 26);
}

export async function exportMiddleEarthPng(
  draft: MiddleEarthDraft,
  target: HTMLElement,
  options: { download?: boolean } = {},
): Promise<string> {
  if (!target) throw new Error("The live preview is unavailable. Try again.");
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not prepare the export canvas.");
  context.fillStyle = "#f4eee2";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#193b3b";
  context.fillRect(0, 0, canvas.width, 26);
  context.fillStyle = "#dfb65b";
  context.fillRect(0, 1324, canvas.width, 26);

  const shouldRenderImage = Boolean(draft.asset?.thumbnail && !(draft.kind === "spellbook" && draft.layout === "Type specimen"));
  const image = shouldRenderImage && draft.asset?.thumbnail
    ? await new Promise<HTMLImageElement | null>((resolve) => {
        const loaded = new Image();
        loaded.crossOrigin = "anonymous";
        loaded.onload = () => resolve(loaded);
        loaded.onerror = () => resolve(null);
        loaded.src = draft.asset?.thumbnail ?? "";
      })
    : null;
  if (shouldRenderImage && draft.asset && !image) {
    throw new Error("The selected image could not be loaded for export. Choose another record or use typography-only.");
  }
  const hasImage = Boolean(image) && draft.layout !== "Type specimen";
  const isStructuredReaction = draft.kind === "meme" && Boolean(draft.cardFormat);
  const isMemeRework = draft.creationPath === "meme-rework" && Boolean(draft.memeRework);
  if (isMemeRework) {
    if (!image) throw new Error("The original meme could not be loaded for this rework export.");
    drawMemeReworkFrame(context, draft, image);
    const imageUrl = canvas.toDataURL("image/png");
    if (options.download !== false) downloadCanvasPng(canvas, `${draft.title || "middle-earth"}-rework`);
    return imageUrl;
  }
  const isClassicReactionFrame = isStructuredReaction && draft.layout === "Classic top / bottom";
  if (isClassicReactionFrame) {
    drawClassicReactionFrame(context, draft, image);
    const imageUrl = canvas.toDataURL("image/png");
    if (options.download !== false) downloadCanvasPng(canvas, draft.title);
    return imageUrl;
  }
  if (hasImage && image) {
    context.save();
    context.globalAlpha = 0.72;
    drawCanvasImageCover(context, image, 0, 0, 1080, 1350);
    context.restore();
  }
  context.fillStyle = hasImage ? "rgba(8,18,19,.22)" : "#a55439";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const gradient = context.createLinearGradient(0, 0, 0, 1350);
  gradient.addColorStop(0, "rgba(8,18,19,.58)");
  gradient.addColorStop(.42, "rgba(8,18,19,.05)");
  gradient.addColorStop(1, "rgba(8,18,19,.65)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (draft.layout === "Marginalia") {
    context.fillStyle = "rgba(16,45,46,.78)";
    context.fillRect(540, 0, 540, 1350);
    context.fillStyle = "#d4a951";
    context.fillRect(600, 235, 2, 865);
  } else if (draft.layout === "Quote card") {
    context.fillStyle = "rgba(16,45,46,.62)";
    context.fillRect(80, 250, 920, 780);
  }
  context.fillStyle = "rgba(8,18,19,.86)";
  context.fillRect(82, 112, 470, 58);
  context.fillStyle = "#f4eee2";
  context.textAlign = "left";
  context.font = "600 20px monospace";
  const artifactLabel = draft.cardFormat || draft.artifactType || (draft.kind === "meme" ? "Meme card" : "Spellbook");
  context.fillText(`MEMEFORGE // ${artifactLabel.toUpperCase()}`.slice(0, 48), 108, 149);
  const layout = draft.layout === "Editorial caption"
    ? { x: 92, y: 800, width: 896, size: 58, lineHeight: 70, maxLines: 6, align: "left" as CanvasTextAlign }
    : draft.layout === "Tiny confession"
      ? { x: 92, y: 930, width: 680, size: 42, lineHeight: 54, maxLines: 4, align: "left" as CanvasTextAlign }
      : draft.layout === "Quote card" || draft.layout === "Type specimen"
        ? { x: 540, y: 410, width: 820, size: 64, lineHeight: 76, maxLines: 9, align: "center" as CanvasTextAlign }
        : draft.layout === "Marginalia"
          ? { x: 640, y: 330, width: 360, size: 46, lineHeight: 58, maxLines: 10, align: "left" as CanvasTextAlign }
          : { x: 108, y: 650, width: 864, size: 66, lineHeight: 78, maxLines: 7, align: "left" as CanvasTextAlign };
  context.textAlign = layout.align;
  context.font = `700 ${layout.size}px Georgia`;
  const lines = isStructuredReaction
    ? [draft.text || "Your setup belongs here."]
    : wrapCanvasText(context, draft.text || "Your words belong here.", layout.width);
  if (isStructuredReaction) {
    const reactionLines = [lines[0], draft.secondaryText || "Your reaction belongs here."];
    const reactionFontSize = 58;
    const reactionLineHeight = 66;
    context.font = `700 ${reactionFontSize}px Arial`;
    const reactionBlocks = reactionLines.map((line) => (
      wrapCanvasText(context, line.toUpperCase(), 840).slice(0, 2)
    ));
    const drawReactionBlock = (block: string[], top: number) => {
      const height = block.length * reactionLineHeight + 38;
      context.fillStyle = "rgba(8,18,19,.88)";
      context.fillRect(80, top, 920, height);
      context.fillStyle = "#f8f3e8";
      block.forEach((line, index) => {
        context.fillText(line, 108, top + reactionFontSize + 10 + index * reactionLineHeight);
      });
    };
    drawReactionBlock(reactionBlocks[0], 430);
    drawReactionBlock(reactionBlocks[1], 860);
  } else {
    lines.slice(0, layout.maxLines).forEach((line, index) => {
      context.fillText(line, layout.x, layout.y + index * layout.lineHeight);
    });
  }
  if (draft.secondaryText && !isStructuredReaction) {
    context.fillStyle = "#d4b068";
    const secondarySize = draft.kind === "meme" ? Math.max(38, Math.round(layout.size * .78)) : 30;
    const secondaryLineHeight = draft.kind === "meme" ? Math.max(46, Math.round(layout.lineHeight * .8)) : 38;
    context.font = `${draft.kind === "meme" ? "700" : "500"} ${secondarySize}px Georgia`;
    const secondaryY = Math.min(
      1180,
      layout.y + Math.min(lines.length, layout.maxLines) * layout.lineHeight + 42,
    );
    wrapCanvasText(context, draft.secondaryText, layout.width).slice(0, draft.kind === "meme" ? 2 : 3).forEach((line, index) => {
      context.fillText(line, layout.x, secondaryY + index * secondaryLineHeight);
    });
  }
  context.textAlign = "left";
  context.font = "500 17px monospace";
  const footerLabel = draft.cardFormat
    ? draft.cardFooter
    : [draft.memeFlavor, draft.aesthetic].filter(Boolean).join(" · ");
  if (footerLabel) {
    context.fillStyle = "rgba(8,18,19,.82)";
    context.fillRect(82, 1214, 700, 58);
    context.fillStyle = "#d8cdb8";
    context.fillText(footerLabel.toUpperCase().slice(0, 54), 108, 1252);
  }
  context.fillStyle = "#193b3b";
  context.textAlign = "center";
  context.font = "500 16px monospace";
  context.fillText("fandom.justlikekatie.com/memeforge/middle-earth", canvas.width / 2, canvas.height - 8);
  const imageUrl = canvas.toDataURL("image/png");
  if (options.download !== false) downloadCanvasPng(canvas, draft.title);
  return imageUrl;
}

function wrapCanvasText(context: CanvasRenderingContext2D, value: string, maxWidth: number): string[] {
  return value.split(/\n/).flatMap((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean).flatMap((word) => {
      if (context.measureText(word).width <= maxWidth) return [word];
      const chunks: string[] = [];
      let remaining = word;
      while (remaining) {
        let end = remaining.length;
        while (end > 1 && context.measureText(remaining.slice(0, end)).width > maxWidth) end -= 1;
        chunks.push(remaining.slice(0, end));
        remaining = remaining.slice(end);
      }
      return chunks;
    });
    if (!words.length) return [""];
    const lines: string[] = [];
    let line = "";
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width <= maxWidth || !line) line = candidate;
      else { lines.push(line); line = word; }
    });
    if (line) lines.push(line);
    return lines;
  });
}

function parseTagList(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((tag) => tag.trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_-]/gu, ""))
    .filter(Boolean)
    .slice(0, 8)
    .map((tag) => `#${tag.slice(0, 49)}`);
}

export function MiddleEarthWorkspace({ isAdmin, onCreatePacket }: {
  isAdmin: boolean;
  onCreatePacket: (draft: MiddleEarthDraft) => Promise<void>;
}) {
  const kind: MiddleEarthContentKind = "meme";
  const [activeStep, setActiveStep] = useState<"forge" | "spellbook">("forge");
  const [archiveSearchRequestGate] = useState(createArchiveSearchRequestGate);
  const [translationRequestGate] = useState(createArchiveSearchRequestGate);
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [reactionSearchMode, setReactionSearchMode] = useState<ReactionSearchMode>("clean-still");
  const [sourceTreatment, setSourceTreatment] = useState<MemeSourceTreatment>("new-overlay");
  const [results, setResults] = useState<MiddleEarthAsset[]>([]);
  const [comparisonEmotion, setComparisonEmotion] = useState<string>();
  const [selected, setSelected] = useState<MiddleEarthAsset>();
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [moment, setMoment] = useState("");
  const [translation, setTranslation] = useState<GeneratedMemeTranslation>();
  const [referenceStillFamily, setReferenceStillFamily] = useState<ReferenceStillFamilyId>();
  const [character, setCharacter] = useState(characterFilters[0]);
  const [memeFlavor, setMemeFlavor] = useState<MemeFlavorName | typeof autoSteering>(autoSteering);
  const [aesthetic, setAesthetic] = useState<AestheticName | typeof autoSteering>(autoSteering);
  const [artifactType, setArtifactType] = useState<ArtifactType | typeof autoSteering>(autoSteering);
  const [creativeDirection, setCreativeDirection] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [secondaryText, setSecondaryText] = useState("");
  const [cardFormat, setCardFormat] = useState<MemeCardFormat>();
  const [tone, setTone] = useState(memeTones[0]);
  const [layout, setLayout] = useState(memeLayouts[0]);
  const [visualGeneration, setVisualGeneration] = useState<MiddleEarthDraft["aiGeneration"]>();
  const [rednoteTitle, setRednoteTitle] = useState("");
  const [rednoteCaption, setRednoteCaption] = useState("");
  const [rednoteTags, setRednoteTags] = useState<string[]>([]);
  const [rednoteGeneratedAt, setRednoteGeneratedAt] = useState("");
  const [rednoteModel, setRednoteModel] = useState("");
  const [rednoteCharacter, setRednoteCharacter] = useState("");
  const [rednoteGroundingFingerprint, setRednoteGroundingFingerprint] = useState("");
  const [previewImageFailed, setPreviewImageFailed] = useState(false);
  const [previewNode, setPreviewNode] = useState<HTMLElement | null>(null);
  const [packetSaved, setPacketSaved] = useState(false);
  const [collectionSaved, setCollectionSaved] = useState(false);
  const [originalCollectionSaved, setOriginalCollectionSaved] = useState(false);
  const [reworkEditMode, setReworkEditMode] = useState<MemeReworkEditMode>("cover-and-replace");

  const isAuto = (value: string) => value === autoSteering;
  const resolvedCharacter = isAuto(character) ? translation?.character ?? "The Fellowship" : character;
  const resolvedMemeFlavor = isAuto(memeFlavor) ? translation?.memeFlavor : memeFlavor;
  const resolvedComicMechanism = translation?.comicMechanism;
  const resolvedAesthetic = isAuto(aesthetic) ? translation?.aesthetic : aesthetic;
  const resolvedArtifactType = isAuto(artifactType) ? translation?.artifactType : artifactType;
  const selectedFlavor = memeFlavors.find((flavor) => flavor.name === resolvedMemeFlavor);
  const activeReferenceStillFamily = referenceStillFamilyById(referenceStillFamily);
  const reactionEmotionOptions = useMemo(
    () => Array.from(new Set(
      (translation?.reactionImageBrief.performedEmotion ?? [])
        .map((emotion) => emotion.trim())
        .filter(Boolean),
    )),
    [translation],
  );
  const visibleResults = useMemo(
    () => filterReactionCandidates(results, comparisonEmotion),
    [results, comparisonEmotion],
  );
  const isExistingMemeAsIs = reactionSearchMode === "existing-meme"
    && sourceTreatment === "as-is"
    && Boolean(selected);
  const sourcePath: MemeSourcePath = reactionSearchMode === "clean-still"
    ? "new-image"
    : sourceTreatment === "as-is"
      ? "existing-meme"
      : "rework-existing";
  const isEditorRequired = sourcePath !== "existing-meme";
  const isReworkExisting = sourcePath === "rework-existing";
  const canSaveOriginalMeme = Boolean(selected && (isExistingMemeAsIs || isReworkExisting));
  const hasReworkOverlay = Boolean(isReworkExisting && selected && (text.trim() || secondaryText.trim()));
  const hasSavableGeneratedCard = Boolean(visualGeneration || hasReworkOverlay);
  const reworkPanelTitle = reactionSearchMode === "existing-meme" ? "Rework this existing meme" : "Forge a new reaction card";
  const generationGuidance = useMemo(() => [
    moment.trim() ? `Original moment: ${moment.trim()}` : "",
    translation ? `Translated as: ${translation.translatedMoment}\nScene: ${translation.scene}\nComic mechanism: ${translation.comicMechanism}\nVisual direction: ${translation.visualDirection}\nVisual joke role: ${translation.reactionImageBrief.visualRole}\nPerformed reaction: ${translation.reactionImageBrief.performedEmotion.join(", ")}` : "",
    creativeDirection.trim() ? `Additional direction: ${creativeDirection.trim()}` : "",
  ].filter(Boolean).join("\n").slice(0, 500), [moment, translation, creativeDirection]);
  const memeRework = useMemo(
    () => isReworkExisting && selected && hasReworkOverlay
      ? createMemeReworkMetadata(selected, {
          mode: reworkEditMode,
          line1: text,
          line2: secondaryText,
          footer: title,
          layout,
          tone,
        })
      : undefined,
    [isReworkExisting, selected, hasReworkOverlay, reworkEditMode, text, secondaryText, title, layout, tone],
  );

  const invalidateGeneratedVisual = () => {
    setVisualGeneration(undefined);
    setPacketSaved(false);
  };

  useEffect(() => {
    let current = true;
    if (!canSaveOriginalMeme || !selected) {
      setOriginalCollectionSaved(false);
      return () => { current = false; };
    }
    void dbIsCardSaved(selected.media?.deliveryUrl || selected.thumbnail).then(saved => {
      if (current) setOriginalCollectionSaved(saved);
    }).catch(() => {
      if (current) setOriginalCollectionSaved(false);
    });
    return () => { current = false; };
  }, [canSaveOriginalMeme, selected]);

  useEffect(() => {
    if (isEditorRequired) setCollectionSaved(false);
  }, [isEditorRequired, title, text, secondaryText, layout, selected?.id, visualGeneration]);

  const clearReactionGrounding = () => {
    archiveSearchRequestGate.invalidate();
    translationRequestGate.invalidate();
    setTranslation(undefined);
    setReferenceStillFamily(undefined);
    setSelected(undefined);
    setComparisonEmotion(undefined);
    setResults([]);
    setSearchedQuery("");
    setReactionSearchMode("clean-still");
    setSourceTreatment("new-overlay");
    setSearching(false);
    setTitle("");
    setText("");
    setSecondaryText("");
    setCardFormat(undefined);
    invalidateGeneratedVisual();
  };

  const updateMoment = (value: string) => {
    archiveSearchRequestGate.invalidate();
    translationRequestGate.invalidate();
    setMoment(value);
    setReferenceStillFamily(undefined);
    setTranslation(undefined);
    setSelected(undefined);
    setResults([]);
    setSearchedQuery("");
    setReactionSearchMode(isReworkExisting ? "existing-meme" : "clean-still");
    setSourceTreatment("new-overlay");
    if (isReworkExisting) {
      setQuery([value.trim(), "meme"].filter(Boolean).join(" ").slice(0, 200));
    }
    setComparisonEmotion(undefined);
    setSearching(false);
    setError("");
    setStatus(isReworkExisting && value.trim()
      ? `Rework search is ready: “${value.trim()} meme”. Search now, then keep the source or add your own joke.`
      : "");
    setTitle("");
    setText("");
    setSecondaryText("");
    setCardFormat(undefined);
    invalidateGeneratedVisual();
  };

  const search = async (
    event?: FormEvent,
    requestedQuery?: string,
  ) => {
    event?.preventDefault();
    const rawQuery = (requestedQuery ?? query).trim();
    const clean = isReworkExisting && rawQuery && !/\bmeme\b/iu.test(rawQuery)
      ? `${rawQuery} meme`.slice(0, 200)
      : rawQuery;
    if (!clean) return;
    if (clean !== query) setQuery(clean);
    const requestId = archiveSearchRequestGate.begin();
    setComparisonEmotion(undefined);
    setSelected(undefined); setPreviewImageFailed(false); setVisualGeneration(undefined); setPacketSaved(false);
    setSourceTreatment(sourcePath === "existing-meme" ? "as-is" : "new-overlay");
    setSearching(true); setError(""); setStatus("");
    try {
      const response = await fetch(`/.netlify/functions/middle-earth-search?q=${encodeURIComponent(clean)}`);
      if (!response.ok) throw new Error("The archive did not answer. Try that search again.");
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("The archive service is unavailable in this preview.");
      }
      const payload = await response.json() as SearchResponse;
      if (!archiveSearchRequestGate.isCurrent(requestId)) return;
      const allCandidates = payload.results
        .map((result, index) => makeAsset(result, payload.query || clean, index));
      const candidates = await loadableReactionAssets(allCandidates, canLoadReactionImage);
      if (!archiveSearchRequestGate.isCurrent(requestId)) return;
      setResults(candidates);
      setSearchedQuery(payload.query || clean);
      const autoSelected = candidates[0];
      setSelected(autoSelected);
      setPreviewImageFailed(false);
      setVisualGeneration(undefined);
      setStatus(autoSelected
        ? `Found ${candidates.length} usable reaction-image ${candidates.length === 1 ? "candidate" : "candidates"}. “${autoSelected.title}” is selected; choose another if it misses the bit.`
        : allCandidates.length
          ? `Found ${allCandidates.length} attributed reaction-image ${allCandidates.length === 1 ? "candidate" : "candidates"}, but none could be loaded. Use typography-only or try another search.`
          : "No records found.");
    } catch (searchError) {
      if (!archiveSearchRequestGate.isCurrent(requestId)) return;
      setResults([]); setError(searchError instanceof Error ? searchError.message : "The archive is unavailable.");
    } finally {
      if (archiveSearchRequestGate.isCurrent(requestId)) setSearching(false);
    }
  };

  const searchReactionLadder = async (
    brief: ReactionImageBrief,
    curatedSceneQuery: string | string[] = "",
    curatedOnly = false,
  ) => {
    const requestId = archiveSearchRequestGate.begin();
    setComparisonEmotion(undefined);
    setSourceTreatment("new-overlay");
    const curatedQueries = Array.isArray(curatedSceneQuery)
      ? curatedSceneQuery
      : [curatedSceneQuery];
    const ladder = curatedOnly
      ? curatedQueries
          .map((sceneQuery) => sceneQuery.trim())
          .filter(Boolean)
          .map((sceneQuery) => ({ query: sceneQuery, tier: "Iconic scene" as const }))
      : reactionQueryLadder(brief, curatedSceneQuery);
    if (!ladder.length) return;
    setSelected(undefined); setPreviewImageFailed(false); setVisualGeneration(undefined); setPacketSaved(false);
    setSearching(true); setError(""); setStatus("MemeForge is looking for the reaction face…");
    try {
      const responses = await Promise.allSettled(ladder.map(async (step, stepIndex) => {
        const response = await fetch(`/.netlify/functions/middle-earth-search?q=${encodeURIComponent(step.query)}`);
        if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
          throw new Error(`The archive could not search “${step.query}”.`);
        }
        const payload = await response.json() as SearchResponse;
        return payload.results.map((result, resultIndex) => ({
          candidate: makeAsset(result, payload.query || step.query, resultIndex),
          queryTier: step.tier,
          ...("performedEmotion" in step && step.performedEmotion
            ? { performedEmotion: step.performedEmotion }
            : {}),
          rank: stepIndex * 100 + resultIndex,
        }));
      }));
      if (!archiveSearchRequestGate.isCurrent(requestId)) return;
      const ranked = rankReactionCandidates(
        responses.flatMap((result) => result.status === "fulfilled" ? result.value : []),
      );
      if (!ranked.length && responses.every((result) => result.status === "rejected")) {
        throw new Error("The archive did not answer any reaction-image searches. Try again in a moment.");
      }
      const loadableCandidates = await loadableReactionAssets(ranked, canLoadReactionImage, ranked.length);
      const candidates = retainReactionEmotionCandidates(
        loadableCandidates,
        brief.performedEmotion,
      );
      if (!archiveSearchRequestGate.isCurrent(requestId)) return;
      setResults(candidates);
      setSearchedQuery(ladder[0].query);
      setQuery(ladder[0].query);
      const autoSelected = candidates[0];
      setSelected(autoSelected);
      setPreviewImageFailed(false);
      setVisualGeneration(undefined);
      setStatus(autoSelected
        ? `Found ${candidates.length} usable reaction-image ${candidates.length === 1 ? "candidate" : "candidates"} across ${ladder.length} human-native searches. “${autoSelected.title}” is selected; choose the still that performs the bit.`
        : "The query ladder found attributed records, but none could be loaded. Use typography-only or try a manual search.");
    } catch (searchError) {
      if (!archiveSearchRequestGate.isCurrent(requestId)) return;
      setResults([]); setError(searchError instanceof Error ? searchError.message : "The reaction-image search is unavailable.");
    } finally {
      if (archiveSearchRequestGate.isCurrent(requestId)) setSearching(false);
    }
  };

  const selectStep = (next: "forge" | "spellbook") => {
    if (next === "spellbook" && !isEditorRequired) return;
    setActiveStep(next);
    setStatus("");
    setPacketSaved(false);
  };

  const compareReactionEmotion = (nextEmotion?: string) => {
    setComparisonEmotion(nextEmotion);
    setStatus(nextEmotion
      ? `Showing ${nextEmotion} reaction candidates. Your selected source stays attached.`
      : "Showing all reaction candidates. Your selected source stays attached.");
  };

  const changeReactionSearchMode = (nextMode: ReactionSearchMode) => {
    if (nextMode === reactionSearchMode) return;
    archiveSearchRequestGate.invalidate();
    setReactionSearchMode(nextMode);
    setSourceTreatment(nextMode === "existing-meme" ? "as-is" : "new-overlay");
    setComparisonEmotion(undefined);
    setSelected(undefined);
    setPreviewImageFailed(false);
    invalidateGeneratedVisual();
    setResults([]);
    setSearchedQuery("");
    setError("");
    if (nextMode === "existing-meme") {
      setQuery(moment.trim()
        ? [resolvedCharacter, moment.trim(), "meme"].filter(Boolean).join(" ").replace(/\s+/gu, " ").slice(0, 200)
        : "Middle-earth meme");
      setStatus("Existing-meme mode is ready. Search the situation to find pre-captioned examples you can grab or rework.");
    } else {
      const cleanQuery = referenceStillSearchQueries(referenceStillFamily, translation?.reactionImageBrief.socialUseQuery)[0] ?? "";
      setQuery(cleanQuery);
      setStatus("Clean-still mode is ready. Search canonical Middle-earth scenes for a fresh overlay.");
    }
  };

  const handleExistingMemeUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Upload a PNG, JPEG, or WebP image so it can be stored in MEDIA.");
      return;
    }
    if (file.size > maxUploadedMemeBytes) {
      setError("That image is larger than 8 MB. Choose a smaller existing meme.");
      return;
    }
    setBusy(true);
    setError("");
    setStatus(isReworkExisting ? "Reading your existing meme for an optional rework…" : "Reading your existing meme without changing it…");
    archiveSearchRequestGate.invalidate();
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      const titleFromFile = file.name.replace(/\.[^/.]+$/u, "").trim() || "Your uploaded meme";
      const uploadedAsset: MiddleEarthAsset = {
        id: `local-upload-${file.name}-${file.lastModified}-${file.size}`,
        title: titleFromFile,
        thumbnail: dataUrl,
        url: dataUrl,
        publisher: "Uploaded from your device",
        query: "Your uploaded meme",
        provider: "local-upload",
        sourceType: "upload",
        collectionLocalId: crypto.randomUUID(),
      };
      setReactionSearchMode("existing-meme");
      setSourceTreatment(isReworkExisting ? "new-overlay" : "as-is");
      setComparisonEmotion(undefined);
      setResults([uploadedAsset]);
      setSearchedQuery("your uploaded meme");
      setQuery("your uploaded meme");
      setSelected(uploadedAsset);
      setPreviewImageFailed(false);
      setCollectionSaved(false);
      setOriginalCollectionSaved(false);
      invalidateGeneratedVisual();
      setStatus(isReworkExisting
        ? `“${file.name}” is ready. Save the original now, or add your own optional joke in the editor.`
        : `“${file.name}” is ready. The editor is bypassed and the original image will be exported unchanged.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "The existing meme could not be loaded.");
    } finally {
      setBusy(false);
    }
  };

  const chooseSourcePath = (nextPath: MemeSourcePath) => {
    const nextMode: ReactionSearchMode = nextPath === "new-image" ? "clean-still" : "existing-meme";
    if (nextMode !== reactionSearchMode) changeReactionSearchMode(nextMode);
    setSourceTreatment(nextPath === "existing-meme" ? "as-is" : "new-overlay");
    setActiveStep("forge");
    setPacketSaved(false);
    if (nextPath === "existing-meme") {
      setStatus("Unchanged export selected. Find a finished meme, then export or save its original bytes without opening the editor.");
    } else if (nextPath === "rework-existing") {
      setStatus("Rework selected. Find or upload a finished meme, save it as-is if you want, or add your own optional joke in the editor.");
    } else {
      setStatus("New image selected. Find a clean canonical still, then open the editor to make a new reaction card.");
    }
  };

  const translateMoment = async () => {
    if (!isAdmin) {
      setError("Sign in through packet staging to translate a moment.");
      return;
    }
    if (!moment.trim()) {
      setError("Start with the moment you want MemeForge to translate.");
      return;
    }
    const translatingRework = isReworkExisting;
    const requestId = translationRequestGate.begin();
    if (!translatingRework) setSelected(undefined);
    setPreviewImageFailed(false); setVisualGeneration(undefined); setPacketSaved(false);
    setBusy(true); setError(""); setStatus("MemeForge is finding the fandom angle…");
    try {
      const generated = await translateMemeMoment({
        moment: moment.trim(),
        ...(isAuto(character) ? {} : { character }),
        ...(isAuto(memeFlavor) ? {} : { memeFlavor }),
        ...(isAuto(aesthetic) ? {} : { aesthetic }),
        ...(isAuto(artifactType) ? {} : { artifactType }),
        ...(creativeDirection.trim() ? { guidance: creativeDirection.trim() } : {}),
      });
      if (!translationRequestGate.isCurrent(requestId)) return;
      setTranslation(generated);
      setComparisonEmotion(undefined);
      setReferenceStillFamily(generated.referenceStillFamily);
      setTone(generated.tone);
      setTitle(generated.cardText.footer);
      setText(generated.cardText.line1);
      setSecondaryText(generated.cardText.line2);
      setCardFormat(generated.cardText.format);
      setReactionSearchMode("clean-still");
      setSourceTreatment("new-overlay");
      if (translatingRework) {
        setReactionSearchMode("existing-meme");
        setSourceTreatment("new-overlay");
        if (!translationRequestGate.isCurrent(requestId)) return;
        setStatus("Joke suggestion ready. Your existing meme stays selected; edit either line or save the original below.");
        return;
      }
      const curatedSceneQueries = referenceStillSearchQueries(generated.referenceStillFamily);
      const curatedSceneQuery = curatedSceneQueries[0] || generated.reactionImageBrief.socialUseQuery;
      setQuery(curatedSceneQuery);
      invalidateGeneratedVisual();
      await searchReactionLadder(generated.reactionImageBrief, curatedSceneQueries);
      if (!translationRequestGate.isCurrent(requestId)) return;
      setStatus("Moment translated. The text joke and image joke are paired; choose the reaction still that lands the bit, then forge the card.");
    } catch (translationError) {
      setError(translationError instanceof Error ? translationError.message : "MemeForge could not translate that moment.");
    } finally {
      setBusy(false);
    }
  };

  const rednoteTouched = Boolean(rednoteTitle.trim() || rednoteCaption.trim() || rednoteTags.length);
  const currentGroundingFingerprint = useMemo(() => middleEarthGroundingFingerprint({
    character: resolvedCharacter,
    memeFlavor: resolvedMemeFlavor,
    comicMechanism: resolvedComicMechanism,
    aesthetic: resolvedAesthetic,
    artifactType: resolvedArtifactType,
    tone,
    layout,
    guidance: generationGuidance,
    referenceStillFamily,
    reactionImageBrief: translation?.reactionImageBrief,
    source: selected ? {
      id: selected.id,
      title: selected.title,
      sourceUrl: selected.url,
      publisher: selected.publisher,
      query: selected.query,
    } : undefined,
    visual: {
      title,
      primaryText: text,
      secondaryText,
      cardFormat,
    },
  }), [resolvedCharacter, resolvedMemeFlavor, resolvedComicMechanism, resolvedAesthetic, resolvedArtifactType, tone, layout, generationGuidance, referenceStillFamily, translation, selected, title, text, secondaryText, cardFormat]);
  const rednoteIsCurrent = Boolean(
    rednoteGroundingFingerprint
    && rednoteGroundingFingerprint === currentGroundingFingerprint
  );
  const rednoteCopy = useMemo<MiddleEarthRednoteCopy | undefined>(() => {
    if (!rednoteIsCurrent || !rednoteTitle.trim() || !rednoteCaption.trim() || rednoteTags.length < 3) return undefined;
    return {
      title: rednoteTitle.trim(),
      caption: rednoteCaption.trim(),
      tags: rednoteTags,
      character: rednoteCharacter,
      generatedAt: rednoteGeneratedAt || new Date().toISOString(),
      provider: "xai",
      ...(rednoteModel ? { model: rednoteModel } : {}),
    };
  }, [rednoteIsCurrent, rednoteTitle, rednoteCaption, rednoteTags, rednoteCharacter, rednoteGeneratedAt, rednoteModel]);

  const draft = useMemo<MiddleEarthDraft>(() => ({
    kind, title: title.trim() || cardFormat || "Untitled Middle-earth idea", text: text.trim(),
    secondaryText: secondaryText.trim() || undefined, tone, layout,
    ...(cardFormat ? { cardFormat } : {}),
    ...(title.trim() ? { cardFooter: title.trim() } : {}),
    character: resolvedCharacter.trim(), memeFlavor: resolvedMemeFlavor, ...(resolvedComicMechanism ? { comicMechanism: resolvedComicMechanism } : {}), aesthetic: resolvedAesthetic, artifactType: resolvedArtifactType,
    ...(referenceStillFamily ? { referenceStillFamily } : {}),
    ...(selected?.query || activeReferenceStillFamily ? { referenceStillQuery: selected?.query || activeReferenceStillFamily?.searchQuery } : {}),
    ...(translation?.reactionImageBrief ? { reactionImageBrief: translation.reactionImageBrief } : {}),
    creativeDirection: generationGuidance || undefined,
    aiGeneration: visualGeneration,
    rednoteCopy,
    creationPath: isReworkExisting ? "meme-rework" : "reaction-card",
    ...(memeRework ? { memeRework } : {}),
    asset: selected,
    createdAt: new Date().toISOString(),
  }), [title, text, secondaryText, tone, layout, cardFormat, resolvedCharacter, resolvedMemeFlavor, resolvedComicMechanism, resolvedAesthetic, resolvedArtifactType, referenceStillFamily, activeReferenceStillFamily, translation, generationGuidance, visualGeneration, rednoteCopy, isReworkExisting, memeRework, selected]);

  const sourceContext = useMemo<MiddleEarthAiSource | undefined>(() => selected ? {
    title: selected.title,
    sourceUrl: selected.url,
    ...(selected.publisher ? { publisher: selected.publisher } : {}),
    ...(selected.query ? { query: selected.query } : {}),
  } : undefined, [selected]);

  const generateVisual = async () => {
    if (!isAdmin) {
      setError("Sign in through packet staging to use AI generation.");
      return;
    }
    if (!moment.trim() || !translation) {
      setError("Translate the moment before forging its reaction card.");
      return;
    }
    if (reactionSearchMode === "existing-meme" && sourceTreatment === "as-is") {
      setError("Choose Rework in MemeForge before forging a new overlay card.");
      return;
    }
    if (
      title !== translation.cardText.footer
      || text !== translation.cardText.line1
      || secondaryText !== translation.cardText.line2
      || cardFormat !== translation.cardText.format
    ) {
      setError("The paired setup or punchline was edited. Translate the moment again so MemeForge can match a new reaction brief and image search.");
      return;
    }
    setBusy(true); setError(""); setStatus("MemeForge is shaping the shareable object…");
    try {
      const generated = await generateVisualObject({
        moment: moment.trim(),
        character: resolvedCharacter.trim(),
        memeFlavor: resolvedMemeFlavor,
        comicMechanism: resolvedComicMechanism,
        aesthetic: resolvedAesthetic,
        artifactType: resolvedArtifactType,
        tone,
        layout,
        guidance: generationGuidance || undefined,
        source: sourceContext,
        reactionImageBrief: translation.reactionImageBrief,
        cardText: translation.cardText,
      });
      setTitle(generated.cardText.footer);
      setText(generated.primaryText);
      setSecondaryText(generated.secondaryText);
      setCardFormat(generated.cardFormat);
      setLayout(generated.layout);
      setVisualGeneration({
        provider: "xai",
        generatedAt: new Date().toISOString(),
        ...(generated.model ? { model: generated.model } : {}),
      });
      setPacketSaved(false);
      setStatus(`Visual object generated${generated.rationale ? ` — ${generated.rationale}` : "."}`);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "MemeForge could not generate the visual object.");
    } finally {
      setBusy(false);
    }
  };

  const generateCopy = async () => {
    if (!isAdmin) {
      setError("Sign in through packet staging to use AI generation.");
      return;
    }
    if (!visualGeneration) {
      setError("Generate the MemeForge visual object before asking Spellbook for Rednote copy.");
      setActiveStep("forge");
      return;
    }
    if (!resolvedCharacter.trim() || !text.trim() || !secondaryText.trim()) {
      setError("Finish both lines of the reaction card and translate the moment first.");
      return;
    }
    setBusy(true); setError(""); setStatus("Spellbook is drafting the Rednote copy package…");
    try {
      const generated = await generateRednoteCopy({
        character: resolvedCharacter.trim(),
        memeFlavor: resolvedMemeFlavor,
        comicMechanism: resolvedComicMechanism,
        aesthetic: resolvedAesthetic,
        artifactType: resolvedArtifactType,
        tone,
        layout,
        guidance: generationGuidance || undefined,
        source: sourceContext,
        visual: {
          title: title.trim() || cardFormat || "Reaction card",
          primaryText: text.trim(),
          secondaryText: secondaryText.trim() || undefined,
          cardFormat,
          layout,
        },
        currentCopy: {
          title: rednoteTitle.trim() || undefined,
          caption: rednoteCaption.trim() || undefined,
          tags: rednoteTags,
        },
      });
      setRednoteTitle(generated.title);
      setRednoteCaption(generated.caption);
      setRednoteTags(generated.tags);
      setRednoteGeneratedAt(new Date().toISOString());
      setRednoteModel(generated.model || "");
      setRednoteCharacter(resolvedCharacter.trim());
      setRednoteGroundingFingerprint(currentGroundingFingerprint);
      setPacketSaved(false);
      setStatus("Rednote title, caption, and tags generated. Edit anything before saving.");
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Spellbook could not generate the Rednote copy.");
    } finally {
      setBusy(false);
    }
  };

  const exportOriginalMeme = async () => {
    if (!selected || !canSaveOriginalMeme) return;
    setBusy(true);
    setStatus(isExistingMemeAsIs ? "Downloading the original meme without overlays…" : "Downloading the locked original source…");
    setError("");
    try {
      await downloadExistingMeme(selected);
      setStatus(isExistingMemeAsIs
        ? "Original meme downloaded unchanged. Source attribution remains attached in your collection."
        : "Original meme downloaded unchanged. The editable derivative remains separate.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  };

  const exportEditedPng = async () => {
    if (!previewNode) {
      setError("The live preview is unavailable. Try again.");
      return;
    }
    setBusy(true); setStatus("Preparing a 1080 × 1350 PNG…"); setError("");
    try {
      await exportMiddleEarthPng(draft, previewNode);
      setStatus(isReworkExisting
        ? "Reworked derivative downloaded. The original source was not changed."
        : "PNG downloaded. No packet was saved.");
    }
    catch (exportError) { setError(exportError instanceof Error ? exportError.message : "Export failed."); }
    finally { setBusy(false); }
  };

  const originalMemeCard = (asset: MiddleEarthAsset): CardRecord => ({
    ...(asset.collectionLocalId ? { localId: asset.collectionLocalId } : {}),
    imageUrl: asset.media?.deliveryUrl || asset.thumbnail,
    thumbnailUrl: asset.media?.thumbnailUrl || asset.thumbnail,
    resultId: asset.id,
    ...(!asset.url.startsWith("data:") ? { sourceUrl: asset.url } : {}),
    actor: resolvedCharacter.trim() || "Middle-earth",
    actorEn: resolvedCharacter.trim() || "Middle-earth",
    vibe: asset.title || "Existing Middle-earth meme",
    vibeEn: "Existing meme · saved as-is",
    vibeEmoji: "🧙",
    capturedDate: new Date().toISOString().slice(0, 10),
    collectionScope: "middle-earth",
    contentKind: "middle-earth-meme",
    title: asset.title || "Existing Middle-earth meme",
    publisher: asset.publisher,
    searchQuery: asset.query,
    ...(asset.media ? { media: asset.media } : {}),
    sourceRoute: "/memeforge/middle-earth",
  });

  const reworkMetadataForAsset = (asset: MiddleEarthAsset) => createMemeReworkMetadata(asset, {
    mode: reworkEditMode,
    line1: text,
    line2: secondaryText,
    footer: title,
    layout,
    tone,
  }, memeRework ? new Date(memeRework.createdAt) : new Date());

  const registerUploadedAssetInMedia = async (asset: MiddleEarthAsset): Promise<MiddleEarthAsset> => {
    if (!asset.thumbnail.startsWith("data:image/")) return asset;
    const collectionLocalId = asset.collectionLocalId || crypto.randomUUID();
    const media = await uploadCollectionImage(
      asset.thumbnail,
      "middle-earth",
      collectionLocalId,
    );
    await dbReplaceCardImage(asset.thumbnail, media);
    return {
      ...asset,
      thumbnail: media.thumbnailUrl,
      url: media.deliveryUrl,
      provider: "fandom-media",
      sourceType: "upload",
      collectionLocalId,
      media,
    };
  };

  const saveExistingMeme = async () => {
    if (!selected || !canSaveOriginalMeme) return;
    setBusy(true); setStatus(isExistingMemeAsIs ? "Saving the attributed meme to your Middle-earth Collection…" : "Saving the original source to your Middle-earth Collection…"); setError("");
    try {
      await dbSaveCard(originalMemeCard(selected));
      const session = await getPublicSession();
      const registeredInMedia = Boolean(session && await shouldSyncCollection(session.accountId));
      let savedAsset = selected;
      if (registeredInMedia && selected.thumbnail.startsWith("data:image/")) {
        savedAsset = await registerUploadedAssetInMedia(selected);
        setSelected(savedAsset);
      }
      if (session && registeredInMedia) {
        await syncPublicCollection(session);
      } else {
        schedulePublicCollectionSync();
      }
      setOriginalCollectionSaved(true);
      setStatus(registeredInMedia
        ? `${isExistingMemeAsIs ? "Saved" : "Original source saved"} to the Middle-earth Collection and registered in MEDIA.`
        : `${isExistingMemeAsIs ? "Saved" : "Original source saved"} to the Middle-earth Collection on this device. Sign in and merge this device to register it in MEDIA.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The meme could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const saveGeneratedMeme = async () => {
    if (!isEditorRequired || !previewNode) {
      setError("The generated card preview is unavailable. Try again.");
      return;
    }
    setBusy(true); setStatus("Rendering and saving your generated card…"); setError("");
    try {
      if (isReworkExisting && (!selected || !memeRework)) {
        throw new Error("Choose an existing meme and add at least one rework line before saving.");
      }
      const session = await getPublicSession();
      const registeredInMedia = Boolean(session && await shouldSyncCollection(session.accountId));
      let sourceAsset = selected;
      if (
        isReworkExisting
        && sourceAsset
        && registeredInMedia
        && sourceAsset.thumbnail.startsWith("data:image/")
      ) {
        sourceAsset = await registerUploadedAssetInMedia(sourceAsset);
        setSelected(sourceAsset);
      }
      const linkedRework = isReworkExisting && sourceAsset
        ? reworkMetadataForAsset(sourceAsset)
        : undefined;
      const renderedDraft: MiddleEarthDraft = {
        ...draft,
        ...(sourceAsset ? { asset: sourceAsset } : {}),
        ...(linkedRework ? { memeRework: linkedRework } : {}),
      };
      const imageUrl = await exportMiddleEarthPng(renderedDraft, previewNode, { download: false });
      const localId = crypto.randomUUID();
      if (isReworkExisting && sourceAsset && !originalCollectionSaved) {
        await dbSaveCard(originalMemeCard(sourceAsset));
        setOriginalCollectionSaved(true);
      }
      await dbSaveCard({
        localId,
        imageUrl,
        thumbnailUrl: imageUrl,
        resultId: `generated-${localId}`,
        ...(sourceAsset?.url && !sourceAsset.url.startsWith("data:")
          ? { sourceUrl: sourceAsset.url }
          : {}),
        actor: resolvedCharacter.trim() || "Middle-earth",
        actorEn: resolvedCharacter.trim() || "Middle-earth",
        vibe: title.trim() || cardFormat || "Generated Middle-earth card",
        vibeEn: isReworkExisting ? "MemeForge rework · original linked" : "MemeForge reaction card",
        vibeEmoji: "🧙",
        capturedDate: new Date().toISOString().slice(0, 10),
        collectionScope: "middle-earth",
        contentKind: "middle-earth-meme",
        title: title.trim() || cardFormat || "Generated Middle-earth card",
        ...(sourceAsset?.publisher ? { publisher: sourceAsset.publisher } : {}),
        ...(sourceAsset?.query ? { searchQuery: sourceAsset.query } : {}),
        ...(linkedRework ? { memeRework: linkedRework } : {}),
        sourceRoute: "/memeforge/middle-earth",
      });
      if (session && registeredInMedia) {
        await syncPublicCollection(session);
      } else {
        schedulePublicCollectionSync();
      }
      setCollectionSaved(true);
      setStatus(registeredInMedia
        ? isReworkExisting
          ? "Reworked derivative and its untouched original were saved to Collection and registered in MEDIA."
          : "Reaction card saved to the Middle-earth Collection and registered in MEDIA."
        : isReworkExisting
          ? "Reworked derivative and its untouched original were saved on this device. Sign in and merge this device to register them in MEDIA."
          : "Reaction card saved to the Middle-earth Collection on this device. Sign in and merge this device to register it in MEDIA.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The generated card could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const savePacket = async () => {
    if (!isAdmin) return;
    if ((!isReworkExisting && (!text.trim() || !secondaryText.trim())) || (isReworkExisting && !hasReworkOverlay)) {
      setError(isReworkExisting
        ? "Add at least one replacement or overlay line before staging this rework."
        : "The reaction card needs both its setup and punchline before it can be saved.");
      return;
    }
    if (rednoteTouched && !rednoteCopy) {
      setError(rednoteGroundingFingerprint && !rednoteIsCurrent
        ? "The visual, character, or source changed after Spellbook wrote this copy. Regenerate it before saving."
        : "Finish the Rednote title, caption, and at least three tags before saving the packet.");
      return;
    }
    setBusy(true); setStatus("Staging your idea packet…"); setError("");
    try {
      let packetDraft = draft;
      if (selected?.thumbnail.startsWith("data:image/")) {
        setStatus("Registering the original source in MEDIA before staging…");
        const durableAsset = await registerUploadedAssetInMedia(selected);
        packetDraft = {
          ...draft,
          asset: durableAsset,
          ...(draft.memeRework ? { memeRework: reworkMetadataForAsset(durableAsset) } : {}),
        };
        setSelected(durableAsset);
      }
      await onCreatePacket(packetDraft);
      setPacketSaved(true);
      setStatus("Idea packet staged. No publish or schedule action was taken.");
    }
    catch (saveError) { setError(ideaPacketStagingErrorMessage(saveError)); }
    finally { setBusy(false); }
  };

  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <a className={styles.backLink} href="/">Fandom / launchpad</a>
        <a className={styles.collectionLink} href="/memeforge/middle-earth?view=collection">Middle-earth Collection</a>
        <div className={styles.eyebrow}><span className={styles.rune} aria-hidden="true">—</span> MemeForge / separate workbench <span className={styles.rule} /></div>
        <h1><small>Middle-earth</small><br /><em>MemeForge</em></h1>
        <p className={styles.intro}>A Middle-earth fandom angle generator, separate from C-drama Vibe Atlas and its CREATE handoff. Say the moment badly. MemeForge finds the bit, then grounds it in a recognizable reaction image. Captions stay original.</p>
      </header>

      <section className={styles.modeSwitch} aria-label="Creation mode">
        <button className={activeStep === "forge" ? styles.modeActive : ""} onClick={() => selectStep("forge")} disabled={busy}>1. MemeForge <small>{isEditorRequired ? "translate, then forge" : "search, then save"}</small></button>
        <button className={activeStep === "spellbook" ? styles.modeActive : ""} onClick={() => selectStep("spellbook")} disabled={busy || !isEditorRequired}>2. Rednote Spellbook <small>{isEditorRequired ? "title · caption · tags" : "not needed for unchanged memes"}</small></button>
      </section>

      <section className={styles.pathChooser} aria-labelledby="path-heading">
        <div className={styles.sectionKicker}>01 / choose the outcome</div>
        <fieldset className={styles.sourceMode}>
          <legend id="path-heading">What do you want to leave with?</legend>
          <p>Choose first. MemeForge will show only the translation, search, and editor steps that outcome needs.</p>
          <div className={styles.pathGrid}>
            <button type="button" className={sourcePath === "existing-meme" ? styles.pathActive : ""} onClick={() => chooseSourcePath("existing-meme")} aria-pressed={sourcePath === "existing-meme"} disabled={busy || searching}>
              <span>01</span><strong>Keep original</strong><small>Save or export a finished meme unchanged</small>
            </button>
            <button type="button" className={sourcePath === "rework-existing" ? styles.pathActive : ""} onClick={() => chooseSourcePath("rework-existing")} aria-pressed={sourcePath === "rework-existing"} disabled={busy || searching}>
              <span>02</span><strong>Rework meme</strong><small>Edit a linked derivative; preserve the original</small>
            </button>
            <button type="button" className={sourcePath === "new-image" ? styles.pathActive : ""} onClick={() => chooseSourcePath("new-image")} aria-pressed={sourcePath === "new-image"} disabled={busy || searching}>
              <span>03</span><strong>Make reaction card</strong><small>Forge an original joke from a clean still</small>
            </button>
          </div>
          <div className={styles.pathStatus}>
             <span>{isReworkExisting ? "Non-destructive rework editor" : isEditorRequired ? "Clean still + original reaction card" : "Direct search · editor bypassed"}</span>
            <p>{sourcePath === "new-image"
              ? "Translate the moment, find a clean still, and forge a new setup-and-punchline card."
              : sourcePath === "rework-existing"
                 ? "The source remains locked. Cover its old caption or add a new overlay, then save a separately linked derivative."
                : "Search for the finished meme now, preserve it exactly, and go straight to export or Collection."}</p>
          </div>
        </fieldset>
      </section>

      {isEditorRequired ? (
       <section className={styles.momentPrompt} aria-labelledby="moment-heading">
        <div>
           <div className={styles.sectionKicker}>02 / {isReworkExisting ? "optional joke assist" : "meme translation"}</div>
           <h2 id="moment-heading">{isReworkExisting ? "Want help with a new joke?" : "What moment are we forging?"}</h2>
           <p>{isReworkExisting ? "Describe your angle if you want a suggestion. You can also write the overlay yourself below." : "Say the moment badly. MemeForge finds the archetype."}</p>
        </div>
        <label htmlFor="meme-moment">The moment</label>
        <textarea
          id="meme-moment"
          value={moment}
          onChange={(event) => updateMoment(event.target.value)}
          rows={3}
          maxLength={500}
          placeholder="e.g. not wanting to go to work on Friday"
          disabled={busy}
        />
        <div className={styles.momentActions}>
          <div className={styles.momentExamples} aria-label="Moment examples">
            {momentExamples.map((example) => <button key={example} type="button" onClick={() => updateMoment(example)} disabled={busy}>{example}</button>)}
          </div>
           {isAdmin
             ? <button className={styles.translateAction} type="button" onClick={() => void translateMoment()} disabled={busy || !moment.trim()}>{busy ? "Working…" : isReworkExisting ? "Suggest a joke" : "Translate moment"}</button>
            : <a className={styles.stagingLink} href="/vibe-atlas?view=plan">Sign in to translate</a>}
        </div>
        {translation && <div className={styles.translationResult}>
          <div><span>You asked</span><strong>{moment}</strong></div>
          <div><span>Translated as</span><strong>{translation.translatedMoment}</strong></div>
          <div className={styles.translationDetails}>
            <div><span>Scene</span><p>{translation.scene}</p></div>
            <div><span>Archetype</span><p>{translation.memeFlavor} · {translation.character}</p></div>
              <div><span>Comic mechanism</span><p>{translation.comicMechanism}</p></div>
            <div><span>Vibe</span><p>{translation.tone} · {translation.aesthetic}</p></div>
              <div><span>Text joke</span><p>{translation.cardText.line1} / {translation.cardText.line2}</p></div>
              <div><span>Visual joke role</span><p>{translation.reactionImageBrief.visualRole}</p></div>
              <div><span>Performed reaction</span><p>{translation.reactionImageBrief.performedEmotion.join(" · ")}</p></div>
          </div>
        </div>}
      </section>
       ) : (
        <section className={styles.momentBypass} aria-label="Translation bypassed">
          <div><span>02 / translation bypassed</span><strong>The joke is already in the image.</strong></div>
          <p>This path does not rewrite, reframe, or add copy. Search for the finished meme below and keep its source attached.</p>
        </section>
      )}

      <div className={`${styles.layout} ${isReworkExisting ? styles.layoutRework : ""}`}>
        <aside className={styles.searchRail}>
          <div className={styles.sectionKicker}>03 / choose source image</div>
           {translation || !isEditorRequired || isReworkExisting ? <>
            {reactionSearchMode === "clean-still" && translation && <>
            <label>
              Reaction still family
              <select
                value={referenceStillFamily ?? ""}
                onChange={(event) => {
                  const nextFamily = event.target.value as ReferenceStillFamilyId;
                  if (!nextFamily || nextFamily === referenceStillFamily) return;
                  const curatedQueries = referenceStillSearchQueries(nextFamily);
                  setReactionSearchMode("clean-still");
                   setSourceTreatment("new-overlay");
                  setReferenceStillFamily(nextFamily);
                  setSelected(undefined);
                  setPreviewImageFailed(false);
                  invalidateGeneratedVisual();
                  void searchReactionLadder(translation.reactionImageBrief, curatedQueries, true);
                }}
                disabled={busy || searching}
              >
                {referenceStillFamilies.map((family) => <option key={family.id} value={family.id}>{family.label}</option>)}
              </select>
            </label>
            {activeReferenceStillFamily && <div className={styles.sourceNote}><span className={styles.dot} /> <strong>{activeReferenceStillFamily.label}</strong> · {activeReferenceStillFamily.description}</div>}
            <div className={styles.sourceNote}>
              <span className={styles.dot} />
              <strong>Selected still family</strong> · {activeReferenceStillFamily?.label ?? "Reaction still"}
              <small> {activeReferenceStillFamily?.description} Search starts with “{referenceStillSearchQueries(referenceStillFamily, translation.reactionImageBrief.socialUseQuery)[0]}”. Your original moment and joke stay unchanged.</small>
            </div>
            </>}
            {reactionSearchMode === "existing-meme" && <div className={styles.uploadPanel}>
              <div><strong>Have your own meme?</strong><p>{isReworkExisting ? "Upload it, save the original whenever you want, and optionally add your own joke below." : "Upload the image you already made. MemeForge will keep it byte-for-byte unchanged—no translation, overlays, or branding."}</p></div>
              <label className={styles.uploadLabel} htmlFor="existing-meme-upload">
                Upload image
                <input id="existing-meme-upload" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleExistingMemeUpload(event)} disabled={busy || searching} />
              </label>
            </div>}
             <form className={styles.searchForm} onSubmit={search}>
              <label htmlFor="archive-search">{reactionSearchMode === "existing-meme" ? "Search existing memes" : "Search clean reaction stills"}</label>
              <div className={styles.searchBox}>
                 <input id="archive-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={reactionSearchMode === "existing-meme" ? "Try “Gandalf avoiding homework meme”" : "Try “Sam carrying Frodo reaction still”"} disabled={busy || searching} />
                <button type="submit" aria-label="Search the archive" disabled={busy || searching || !query.trim()}>Search</button>
              </div>
            </form>
            <div className={styles.suggestions}>
              {suggestions.map((group) => <div key={group.label}><span>{group.label}</span><div className={styles.chips}>{group.items.map((item) => <button key={item} onClick={() => { setQuery(item); void search(undefined, item); }} disabled={busy || searching}>{item}</button>)}</div></div>)}
            </div>
             <div className={styles.sourceNote}><span className={styles.dot} /> {sourcePath === "existing-meme" ? "Existing-meme search may return finished images with text. The selected image will stay byte-for-byte unchanged; the editor remains bypassed." : sourcePath === "rework-existing" ? "Rework searches existing memes using your terms plus “meme.” The selected image stays available as the original source while you optionally add an overlay." : "Clean-still search uses canonical scene anchors only. MemeForge adds the new joke as an overlay after you choose the image."} Always check the original publisher before sharing.</div>
          </> : <div className={styles.sourceNote}>Translate the moment first to find its reaction-image candidates.</div>}
        </aside>

        <section className={styles.archive} aria-live="polite">
          <div className={styles.archiveHead}>
            <div>
              <div className={styles.sectionKicker}>04 / source candidates</div>
              <h2>{searchedQuery ? `${reactionSearchMode === "existing-meme" ? "Browse existing memes for" : "Choose a clean reaction still for"} “${searchedQuery}”` : isEditorRequired ? "The image comes after the angle" : "Search for the finished meme"}</h2>
            </div>
            {results.length > 0 && <span className={styles.count}>{comparisonEmotion ? `${visibleResults.length} of ${results.length}` : results.length} candidates</span>}
          </div>
          {searching && <div className={styles.loadingGrid} aria-label="Loading archive records">{[1, 2, 3, 4].map((item) => <div key={item} className={styles.skeleton} />)}</div>}
          {!searching && error && !results.length && <div className={styles.state}><strong>Something interrupted the search.</strong><p>{error}</p><button onClick={() => void search()}>Try again</button></div>}
           {!searching && !error && !results.length && <div className={styles.empty}><span>Reaction image note</span><strong>{searchedQuery ? "Nothing surfaced this time." : !isEditorRequired ? "Search by character, scene, or remembered caption." : translation ? "The angle is ready. MemeForge will look for a small set of recognizable reaction stills." : "Translate the moment above first."}</strong><p>Every candidate keeps its source attached, so the trail back is never lost.</p></div>}
          {!searching && results.length > 0 && reactionEmotionOptions.length > 0 && <div className={styles.emotionComparison} aria-label="Compare reaction candidates by performed emotion">
            <div>
              <span>Compare performed emotion</span>
              <small>Viewing a comparison never changes the selected source, its query, or the typography-only fallback.</small>
            </div>
            <div className={styles.emotionFilters}>
              <button type="button" className={!comparisonEmotion ? styles.emotionFilterActive : ""} onClick={() => compareReactionEmotion()} aria-pressed={!comparisonEmotion} disabled={busy || searching}>All reactions <small>{results.length}</small></button>
              {reactionEmotionOptions.map((emotion) => {
                const matchCount = filterReactionCandidates(results, emotion).length;
                return <button key={emotion} type="button" className={comparisonEmotion === emotion ? styles.emotionFilterActive : ""} onClick={() => compareReactionEmotion(emotion)} aria-pressed={comparisonEmotion === emotion} disabled={busy || searching || !matchCount}>{emotion} <small>{matchCount}</small></button>;
              })}
            </div>
            {selected && comparisonEmotion && !filterReactionCandidates([selected], comparisonEmotion).length && <p>Selected source remains attached from “{selected.query}”. Switch back to all reactions to compare it alongside this view.</p>}
          </div>}
          {!searching && results.length > 0 && !visibleResults.length && <div className={styles.empty}><span>Comparison note</span><strong>No loaded candidates perform “{comparisonEmotion}” yet.</strong><p>Your selected source and its rights-status labeling remain attached. Try another emotion or view all reactions.</p></div>}
          {!searching && visibleResults.length > 0 && <div className={styles.gallery}>{visibleResults.map((asset) => <button key={asset.id} className={`${styles.result} ${selected?.id === asset.id ? styles.resultSelected : ""}`} onClick={() => { setSelected(asset); setVisualGeneration(undefined); setSourceTreatment(sourcePath === "existing-meme" ? "as-is" : "new-overlay"); setPreviewImageFailed(false); setPacketSaved(false); setStatus(sourcePath === "existing-meme" ? `Selected “${asset.title}”. The editor is bypassed; export or save the unchanged meme below.` : sourcePath === "rework-existing" ? `Selected “${asset.title}”. The editor is ready for a fresh rework.` : `Selected “${asset.title}”. Generate the visual object with this source.`); }} aria-pressed={selected?.id === asset.id} disabled={busy}><span className={styles.imageWrap}><img src={asset.thumbnail} alt="" onError={(event) => { event.currentTarget.style.display = "none"; const fallback = event.currentTarget.nextElementSibling as HTMLElement | null; if (fallback) fallback.style.visibility = "visible"; }} /><span className={styles.imageFallback}>Image<br />unavailable</span></span><span className={styles.resultTitle}>{asset.title}</span>{asset.reactionEmotion && <span className={styles.resultEmotion}>{(asset.reactionEmotions ?? [asset.reactionEmotion]).join(" · ")} reaction</span>}<span className={styles.publisher}>{reactionSearchMode === "existing-meme" ? "Existing meme · " : asset.reactionQueryTier ? `${asset.reactionQueryTier} match · ` : ""}{asset.publisher || "Unknown publisher"}</span></button>)}</div>}
        </section>

        <section className={styles.forge}>
          <div className={styles.sectionKicker}>05 / {isEditorRequired ? "forge, then finish" : "review, then save"}</div>
          <div className={styles.forgeHead}>
            <h2>{activeStep === "forge" ? "MemeForge" : "Rednote Spellbook"}</h2>
            <span className={styles.liveMark}>{activeStep === "forge" ? "Shareable object" : "Copy package"}</span>
          </div>

          {!isEditorRequired && activeStep === "forge" ? (
            <div className={styles.editorBypass}>
              <span>Editor bypassed</span>
              <strong>This path preserves the finished meme exactly.</strong>
              <p>{selected
                ? "Your source is ready below. Review its attribution, then export the original image or save it to Collection."
                : "Choose a finished meme from the search results. No setup, punchline, frame, footer, or MemeForge branding will be added."}</p>
              <button type="button" onClick={() => chooseSourcePath("rework-existing")} disabled={busy || searching}>Switch to rework and open the editor</button>
            </div>
          ) : (
          <div className={styles.editorPanel}>
          <div className={styles.editorPanelHead}>
            <span>{isReworkExisting ? "Non-destructive editor" : "Reaction-card editor"}</span>
            <p>{isReworkExisting ? "The source is locked. Every edit becomes a separately saved derivative." : "Turn the clean still into a finished original reaction card."}</p>
          </div>
          {isReworkExisting && (
            <div className={styles.reworkContract}>
              <div>
                <span>Original locked</span>
                <strong>Source and derivative stay linked</strong>
                <p>Saving this rework also preserves the untouched source in Collection. Switching edit modes never changes the original pixels.</p>
              </div>
              <fieldset>
                <legend>Text treatment</legend>
                <button
                  type="button"
                  className={reworkEditMode === "cover-and-replace" ? styles.choiceActive : ""}
                  aria-pressed={reworkEditMode === "cover-and-replace"}
                  onClick={() => setReworkEditMode("cover-and-replace")}
                  disabled={busy}
                >
                  Cover & replace
                  <small>Use solid caption bands to cover old top/bottom text.</small>
                </button>
                <button
                  type="button"
                  className={reworkEditMode === "add-overlay" ? styles.choiceActive : ""}
                  aria-pressed={reworkEditMode === "add-overlay"}
                  onClick={() => setReworkEditMode("add-overlay")}
                  disabled={busy}
                >
                  Add overlay
                  <small>Keep the inherited image visible beneath new caption bands.</small>
                </button>
              </fieldset>
            </div>
          )}
          {!isReworkExisting && <>
          <div className={styles.steeringIntro}><strong>Optional steering</strong><p>Leave any control on Auto / surprise me and let the moment decide. Your manual choices always win.</p></div>
          <label>
            Character
            <select value={character} onChange={(event) => { setCharacter(event.target.value); clearReactionGrounding(); }} disabled={busy}>
              {characterFilters.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <fieldset className={styles.flavorPicker}>
            <legend>Meme Flavor</legend>
            <p className={styles.flavorIntro}>Choose the emotional grammar, not a copied template. Every result remains an original, source-grounded card.</p>
            <div className={styles.flavorGrid}>
              <button
                type="button"
                className={memeFlavor === autoSteering ? styles.flavorActive : ""}
                onClick={() => { if (memeFlavor === autoSteering) return; setMemeFlavor(autoSteering); clearReactionGrounding(); }}
                aria-pressed={memeFlavor === autoSteering}
                disabled={busy}
              >
                <strong>Auto / surprise me</strong>
                <span>Let the translated moment choose the emotional grammar.</span>
              </button>
              {memeFlavors.map((flavor) => (
                <button
                  key={flavor.name}
                  type="button"
                  className={memeFlavor === flavor.name ? styles.flavorActive : ""}
                  onClick={() => {
                    if (memeFlavor === flavor.name) return;
                    setMemeFlavor(flavor.name);
                    clearReactionGrounding();
                  }}
                  aria-pressed={memeFlavor === flavor.name}
                  disabled={busy}
                >
                  <strong>{flavor.name}</strong>
                  <span>{flavor.description}</span>
                </button>
              ))}
            </div>
            {selectedFlavor
              ? <div className={styles.flavorBrief}>
                  <span>{selectedFlavor.coreEmotion}</span>
                  <p>{selectedFlavor.socialSituation}</p>
                  <div className={styles.prototypeBrief}>
                    <span>Baseline bit</span>
                    <strong>{selectedFlavor.prototype.exemplar.line1}</strong>
                    <strong>{selectedFlavor.prototype.exemplar.line2}</strong>
                    <p>{selectedFlavor.prototype.comedicMechanism}</p>
                    <small>Default mechanisms: {selectedFlavor.name === resolvedMemeFlavor
                      ? resolvedComicMechanism ?? 'translate the moment to resolve'
                      : 'resolve after translation'}</small>
                    <small>Use the shape, then mutate it for the moment. Never copy a caption or template.</small>
                  </div>
                  <small>Original archetype only · no raw template recreation</small>
                </div>
              : <div className={styles.flavorBrief}><span>Auto / surprise me</span><p>Translate the moment to reveal a fandom-native archetype.</p><small>Original archetype only · no raw template recreation</small></div>}
          </fieldset>
           <div className={styles.choiceGroup}><span>Aesthetic</span><div><button type="button" className={aesthetic === autoSteering ? styles.choiceActive : ""} onClick={() => { if (aesthetic === autoSteering) return; setAesthetic(autoSteering); clearReactionGrounding(); }} disabled={busy}>Auto / surprise me</button>{aesthetics.map((option) => <button key={option.name} type="button" title={option.description} className={aesthetic === option.name ? styles.choiceActive : ""} onClick={() => { if (aesthetic === option.name) return; setAesthetic(option.name); clearReactionGrounding(); }} disabled={busy}>{option.name}</button>)}</div></div>
          <label>
            Artifact type
            <select value={artifactType} onChange={(event) => { setArtifactType(event.target.value as ArtifactType); clearReactionGrounding(); }} disabled={busy}>
              <option value={autoSteering}>{autoSteering}</option>
              {artifactTypes.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            Creative direction <small className={styles.optional}>optional</small>
            <textarea
              value={creativeDirection}
              onChange={(event) => { setCreativeDirection(event.target.value); clearReactionGrounding(); }}
              rows={2}
              maxLength={500}
              placeholder="e.g. The calm competence of carrying the whole quest"
              disabled={busy}
            />
          </label>
          </>}

          {activeStep === "forge" ? <>
            <div className={styles.aiPanel}>
                <div><strong>{reworkPanelTitle}</strong><p>{isReworkExisting ? "AI is optional. Describe a moment above if you want a joke suggestion, or type your own overlay below." : "Uses the translated moment first, then the selected clean reaction still as its visual anchor. The new card copy remains yours to edit."}</p></div>
              {isAdmin
                ? <button className={styles.aiAction} onClick={() => void generateVisual()} disabled={busy || !translation || isExistingMemeAsIs}>{busy ? "Generating…" : isExistingMemeAsIs ? "Choose Rework to forge" : visualGeneration ? "Reforge card" : "Forge card"}</button>
                : <a className={styles.stagingLink} href="/vibe-atlas?view=plan">Sign in to generate</a>}
            </div>
            {cardFormat && <div className={styles.cardFormat}><span>Reaction format</span><strong>{cardFormat}</strong><p>Two lines only: setup, then punchline. Keep longer interpretation in “Translated as.”</p></div>}
            <label>Tiny footer <small className={styles.optional}>optional</small><input value={title} onChange={(event) => { setTitle(event.target.value); setPacketSaved(false); }} maxLength={45} disabled={busy} /></label>
            <label>{isReworkExisting ? "Joke line 1" : "Setup line"}{isReworkExisting && <small className={styles.optional}> optional</small>}<textarea value={text} onChange={(event) => { setText(event.target.value); setPacketSaved(false); }} rows={2} maxLength={36} disabled={busy} /></label>
            <label>{isReworkExisting ? "Joke line 2" : "Punchline / reaction line"}{isReworkExisting && <small className={styles.optional}> optional</small>}<input value={secondaryText} onChange={(event) => { setSecondaryText(event.target.value); setPacketSaved(false); }} maxLength={36} disabled={busy} /></label>
            <div className={styles.choiceGroup}><span>Tone</span><div>{memeTones.map((option) => <button key={option} className={tone === option ? styles.choiceActive : ""} onClick={() => { if (tone === option) return; setTone(option); invalidateGeneratedVisual(); }} disabled={busy}>{option}</button>)}</div></div>
            <div className={styles.choiceGroup}><span>Layout</span><div>{memeLayouts.map((option) => <button key={option} className={layout === option ? styles.choiceActive : ""} onClick={() => { if (layout === option) return; setLayout(option); invalidateGeneratedVisual(); }} disabled={busy}>{option}</button>)}</div></div>
          </> : <>
            <div className={styles.visualContext}>
              <span>Grounded in the finished visual</span>
              <strong>{title}</strong>
              <p>{text || "Finish the MemeForge object before generating its Rednote copy."}</p>
            </div>
            {!visualGeneration && <p className={styles.copyWarning}>Generate the visual object in step 1 before using Spellbook.</p>}
            {visualGeneration && rednoteTouched && !rednoteIsCurrent && <p className={styles.copyWarning}>The grounding changed. Regenerate this copy before saving it.</p>}
            <div className={styles.aiPanel}>
              <div><strong>Character-filtered Rednote writer</strong><p>Generates a separate editable title, caption, and tag set. Existing edits are used as refinement context.</p></div>
              {isAdmin
                ? <button className={styles.aiAction} onClick={() => void generateCopy()} disabled={busy || !visualGeneration || !text.trim()}>{busy ? "Writing…" : rednoteIsCurrent ? "Refine copy" : "Generate copy"}</button>
                : <a className={styles.stagingLink} href="/vibe-atlas?view=plan">Sign in to generate</a>}
            </div>
            <label>Rednote title<input value={rednoteTitle} onChange={(event) => { setRednoteTitle(event.target.value); setPacketSaved(false); }} maxLength={120} placeholder="A scroll-stopping title" disabled={busy} /></label>
            <label>Rednote caption<textarea value={rednoteCaption} onChange={(event) => { setRednoteCaption(event.target.value); setPacketSaved(false); }} rows={8} maxLength={2200} placeholder="The editable caption draft will appear here." disabled={busy} /></label>
            <label>
              Rednote tags
              <input
                value={rednoteTags.join(" ")}
                onChange={(event) => {
                  setRednoteTags(parseTagList(event.target.value));
                  setPacketSaved(false);
                }}
                placeholder="#MiddleEarth #Gandalf #Fandom"
                disabled={busy}
              />
            </label>
            <p className={styles.copyNote}>Draft only. Review names, tone, source rights, and tags before moving the packet to CREATE.</p>
          </>}
          </div>
          )}

          {!isEditorRequired && !selected ? (
            <div className={styles.previewAwaiting}>
              <span>Original preview</span>
              <strong>Select a finished meme to review it here.</strong>
              <p>The original aspect ratio, embedded text, and image pixels will remain untouched.</p>
            </div>
          ) : isReworkExisting && selected ? (
            <div className={styles.reworkComparison} aria-label="Original and edited derivative comparison">
              <section className={styles.reworkPane}>
                <header><span>Original source</span><strong>Locked</strong></header>
                <div className={styles.originalSourcePreview}>
                  {!previewImageFailed
                    ? <img src={selected.thumbnail} alt={selected.title} onError={() => setPreviewImageFailed(true)} />
                    : <span>Original preview unavailable</span>}
                </div>
                <small>Exportable unchanged · preserved when the derivative is saved</small>
              </section>
              <section className={styles.reworkPane}>
                <header><span>Edited derivative</span><strong>Editable</strong></header>
                <div
                  className={`${styles.preview} ${styles.reworkPreview}`}
                  data-rework-mode={reworkEditMode}
                  ref={setPreviewNode}
                  aria-label="Live reworked meme preview"
                >
                  {!previewImageFailed && <div className={styles.previewStillFrame}><img src={selected.thumbnail} alt="" onError={() => setPreviewImageFailed(true)} /></div>}
                  <div className={styles.previewShade} />
                  <div className={styles.previewCopy}>
                    <span>MEMEFORGE // REWORK</span>
                    <div className={styles.previewLines}>
                      <strong>{text || "Replacement line 1"}</strong>
                      {(secondaryText || !text) && <em>{secondaryText || "Replacement line 2"}</em>}
                    </div>
                  </div>
                  {title && <small>{title}</small>}
                </div>
                <small>{reworkEditMode === "cover-and-replace" ? "Solid bands cover inherited top/bottom text" : "New bands sit over the inherited image"}</small>
              </section>
            </div>
          ) : (
          <div className={`${styles.preview} ${isExistingMemeAsIs ? styles.previewAsIs : ""}`} data-layout={isExistingMemeAsIs ? undefined : layout} ref={setPreviewNode} aria-label={isExistingMemeAsIs ? "Unchanged existing meme preview" : "Live 4 by 5 preview"}>
            {selected && !previewImageFailed && (isExistingMemeAsIs
              ? <img className={styles.asIsImage} src={selected.thumbnail} alt={selected.title} onError={() => setPreviewImageFailed(true)} />
              : <div className={styles.previewStillFrame}><img src={selected.thumbnail} alt="" onError={() => setPreviewImageFailed(true)} /></div>)}
            {!isExistingMemeAsIs && <>
              <div className={styles.previewShade} />
                <div className={styles.previewCopy}>
                  <span>MEMEFORGE // {(cardFormat || resolvedArtifactType || "Reaction").toUpperCase()}</span>
                  <div className={styles.previewLines}>
                    <strong>{text || "Your setup belongs here."}</strong>
                    {secondaryText && <em>{secondaryText}</em>}
                  </div>
                </div>
              {title && <small>{title}</small>}
            </>}
          </div>
          )}
           {selected && <div className={styles.provenance}><strong>{isExistingMemeAsIs ? "Existing meme · unchanged" : isReworkExisting ? "Original source · locked and linked" : "Source attached"}</strong><span>{selected.title}</span><span>{selected.publisher || "Publisher unknown"} · {selected.provider || "Provider unknown"}</span>{selected.provider === "local-upload" ? <small>Your uploaded image is stored locally and will be registered in MEDIA when your Collection syncs.</small> : <a href={selected.url} target="_blank" rel="noreferrer">Open original source</a>}<small>Rights status: unknown. This is a personal draft; confirm permission before publishing.</small></div>}
           {isEditorRequired && selected && <button className={styles.typeFallback} type="button" onClick={() => { setSelected(undefined); setVisualGeneration(undefined); setPacketSaved(false); setStatus("Typography-only fallback selected. Choose a reaction image any time to restore image-backed rendering."); }} disabled={busy}>Use typography-only fallback</button>}
           {isEditorRequired && !selected && <div className={styles.provenanceMuted}>Typography-only fallback is active. Choose a reaction image to restore image-backed rendering.</div>}
          <p className={styles.handoffNote}>{isEditorRequired
             ? isReworkExisting
               ? <><strong>Your source and rework stay separate.</strong> Save the original at any time, or save a reworked card after adding at least one joke line. Translation, AI, and CREATE are optional.</>
               : <><strong>Your generated draft stays here.</strong> PNG export is independent. Packet staging is an optional handoff to the CREATE workflow.</>
            : <><strong>The original stays original.</strong> Export and Collection save use the selected source image without MemeForge overlays or branding.</>}</p>
          <div className={styles.actions}>
             {isEditorRequired && <button className={styles.export} onClick={() => void exportEditedPng()} disabled={busy || (isReworkExisting && !hasReworkOverlay)}>{busy ? "Working…" : isReworkExisting ? "Export rework" : "Export reaction card"}</button>}
              {canSaveOriginalMeme && <button className={styles.exportSecondary} onClick={() => void exportOriginalMeme()} disabled={busy}>{busy ? "Working…" : "Export original"}</button>}
             {canSaveOriginalMeme && <button className={styles.save} onClick={() => void saveExistingMeme()} disabled={busy || originalCollectionSaved}>{originalCollectionSaved ? isExistingMemeAsIs ? "Saved to Collection" : "Original saved" : isExistingMemeAsIs ? "Save to Collection" : "Save original to Collection"}</button>}
              {isEditorRequired && hasSavableGeneratedCard && <button className={styles.save} onClick={() => void saveGeneratedMeme()} disabled={busy || collectionSaved}>{collectionSaved ? "Saved to Collection" : isReworkExisting ? "Save linked rework" : "Save reaction card"}</button>}
             {(canSaveOriginalMeme && originalCollectionSaved || isEditorRequired && hasSavableGeneratedCard && collectionSaved) && <a className={styles.stagingLink} href="/memeforge/middle-earth?view=collection">Open Collection</a>}
            {isEditorRequired && (isAdmin
              ? <button className={styles.save} onClick={() => void savePacket()} disabled={busy}>Stage for CREATE</button>
              : <a className={styles.stagingLink} href="/vibe-atlas?view=plan">Sign in through packet staging</a>)}
            {!isEditorRequired && !selected && <span className={styles.actionHint}>Choose a source to unlock export and Collection save.</span>}
            {packetSaved && <a className={styles.stagingLink} href="/vibe-atlas?view=plan">Open packet staging</a>}
          </div>
          <div className={styles.status} role="status">{error && <span className={styles.statusError}>{error}</span>}{!error && status}</div>
        </section>
      </div>
    </main>
  );
}
