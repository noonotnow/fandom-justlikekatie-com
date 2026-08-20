import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import {
  generateRednoteCopy,
  generateVisualObject,
  middleEarthGroundingFingerprint,
  translateMemeMoment,
  type GeneratedMemeTranslation,
  type MiddleEarthAiSource,
  type MemeCardFormat,
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
  type MemeFlavorName,
} from "../../data/middleEarthCreativeGrammar";
import {
  referenceStillFamilies,
  referenceStillFamilyById,
  referenceStillSearchQuery,
  type ReferenceStillFamilyId,
} from "../../data/middleEarthReferenceStills";
import { loadableReactionAssets } from "../../utils/reactionImageAssets";
import { createArchiveSearchRequestGate } from "./archiveSearchRequestGate";
import styles from "./MiddleEarthWorkspace.module.css";

export interface MiddleEarthAsset {
  id: string;
  title: string;
  thumbnail: string;
  url: string;
  publisher?: string;
  query: string;
  provider?: string;
}

export type MiddleEarthContentKind = "meme" | "spellbook";

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
  aesthetic?: string;
  artifactType?: string;
  referenceStillFamily?: ReferenceStillFamilyId;
  referenceStillQuery?: string;
  creativeDirection?: string;
  aiGeneration?: {
    provider: "xai";
    generatedAt: string;
    model?: string;
  };
  rednoteCopy?: MiddleEarthRednoteCopy;
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

function cardCopyStyle(value: string): CSSProperties & Record<"--card-copy-length", number> {
  return { "--card-copy-length": Math.max([...value].length, 1) };
}

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

export async function exportMiddleEarthPng(
  draft: MiddleEarthDraft,
  target: HTMLElement,
): Promise<void> {
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
  if (hasImage && image) {
    const ratio = Math.max(1080 / image.width, 1350 / image.height);
    const width = image.width * ratio;
    const height = image.height * ratio;
    context.save();
    context.globalAlpha = 0.72;
    context.drawImage(image, (1080 - width) / 2, (1350 - height) / 2, width, height);
    context.restore();
  }
  context.fillStyle = "#102f30";
  context.fillStyle = hasImage ? "rgba(16,45,46,.38)" : "#a55439";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const gradient = context.createLinearGradient(0, 0, 0, 1350);
  gradient.addColorStop(0, "rgba(16,45,46,.88)");
  gradient.addColorStop(.53, "rgba(16,45,46,.15)");
  gradient.addColorStop(1, "rgba(16,45,46,.93)");
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
  context.fillStyle = "#f4eee2";
  context.textAlign = "left";
  context.font = "600 25px Georgia";
  const artifactLabel = draft.cardFormat || draft.artifactType || (draft.kind === "meme" ? "Meme card" : "Spellbook");
  context.fillText(`MIDDLE-EARTH / ${artifactLabel.toUpperCase()}`.slice(0, 58), 108, 170);
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
  const isStructuredReaction = draft.kind === "meme" && Boolean(draft.cardFormat);
  const lines = isStructuredReaction
    ? [draft.text || "Your setup belongs here."]
    : wrapCanvasText(context, draft.text || "Your words belong here.", layout.width);
  if (isStructuredReaction) {
    const reactionLines = [lines[0], draft.secondaryText || "Your reaction belongs here."];
    const widest = Math.max(...reactionLines.map((line) => context.measureText(line).width));
    const fittedSize = Math.max(16, Math.floor(layout.size * Math.min(1, layout.width / widest)));
    const fittedLineHeight = fittedSize + 14;
    context.font = `700 ${fittedSize}px Georgia`;
    reactionLines.forEach((line, index) => {
      context.fillText(line, layout.x, layout.y + index * fittedLineHeight);
    });
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
  context.fillStyle = "#d8cdb8";
  context.textAlign = "left";
  context.font = "500 20px monospace";
  const footerLabel = draft.cardFormat
    ? draft.cardFooter
    : [draft.memeFlavor, draft.aesthetic].filter(Boolean).join(" · ");
  context.fillText((footerLabel || draft.title).toUpperCase().slice(0, 54), 108, 1265);
  context.fillStyle = "#193b3b";
  context.textAlign = "center";
  context.font = "500 16px monospace";
  context.fillText("fandom.justlikekatie.com/memeforge/middle-earth", canvas.width / 2, canvas.height - 8);
  const link = document.createElement("a");
  link.download = `${draft.title || "middle-earth-packet"}.png`.replace(/[^a-z0-9-_]+/gi, "-");
  link.href = canvas.toDataURL("image/png");
  link.click();
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
  const [results, setResults] = useState<MiddleEarthAsset[]>([]);
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

  const isAuto = (value: string) => value === autoSteering;
  const resolvedCharacter = isAuto(character) ? translation?.character ?? "The Fellowship" : character;
  const resolvedMemeFlavor = isAuto(memeFlavor) ? translation?.memeFlavor : memeFlavor;
  const resolvedAesthetic = isAuto(aesthetic) ? translation?.aesthetic : aesthetic;
  const resolvedArtifactType = isAuto(artifactType) ? translation?.artifactType : artifactType;
  const selectedFlavor = memeFlavors.find((flavor) => flavor.name === resolvedMemeFlavor);
  const activeReferenceStillFamily = referenceStillFamilyById(referenceStillFamily);
  const generationGuidance = useMemo(() => [
    moment.trim() ? `Original moment: ${moment.trim()}` : "",
    translation ? `Translated as: ${translation.translatedMoment}\nScene: ${translation.scene}\nVisual direction: ${translation.visualDirection}` : "",
    creativeDirection.trim() ? `Additional direction: ${creativeDirection.trim()}` : "",
  ].filter(Boolean).join("\n").slice(0, 500), [moment, translation, creativeDirection]);

  const invalidateGeneratedVisual = () => {
    setVisualGeneration(undefined);
    setPacketSaved(false);
  };

  const clearReactionGrounding = () => {
    archiveSearchRequestGate.invalidate();
    translationRequestGate.invalidate();
    setTranslation(undefined);
    setReferenceStillFamily(undefined);
    setSelected(undefined);
    setResults([]);
    setSearchedQuery("");
    setSearching(false);
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
    setSearching(false);
    setError("");
    setStatus("");
    invalidateGeneratedVisual();
  };

  const search = async (
    event?: FormEvent,
    requestedQuery?: string,
  ) => {
    event?.preventDefault();
    const clean = (requestedQuery ?? query).trim();
    if (!clean) return;
    const requestId = archiveSearchRequestGate.begin();
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

  const selectStep = (next: "forge" | "spellbook") => {
    setActiveStep(next);
    setStatus("");
    setPacketSaved(false);
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
    const requestId = translationRequestGate.begin();
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
      setReferenceStillFamily(generated.referenceStillFamily);
      setTone(generated.tone);
      const reactionQuery = referenceStillSearchQuery(generated.referenceStillFamily, generated.searchQuery);
      setQuery(reactionQuery);
      invalidateGeneratedVisual();
       await search(undefined, reactionQuery);
      if (!translationRequestGate.isCurrent(requestId)) return;
      setStatus("Moment translated. Choose the reaction image that lands the bit, then forge the card.");
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
    aesthetic: resolvedAesthetic,
    artifactType: resolvedArtifactType,
    tone,
    layout,
    guidance: generationGuidance,
    referenceStillFamily,
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
  }), [resolvedCharacter, resolvedMemeFlavor, resolvedAesthetic, resolvedArtifactType, tone, layout, generationGuidance, referenceStillFamily, selected, title, text, secondaryText, cardFormat]);
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
    character: resolvedCharacter.trim(), memeFlavor: resolvedMemeFlavor, aesthetic: resolvedAesthetic, artifactType: resolvedArtifactType,
    ...(referenceStillFamily ? { referenceStillFamily } : {}),
    ...(selected?.query || activeReferenceStillFamily ? { referenceStillQuery: selected?.query || activeReferenceStillFamily?.searchQuery } : {}),
    creativeDirection: generationGuidance || undefined,
    aiGeneration: visualGeneration, rednoteCopy, asset: selected, createdAt: new Date().toISOString(),
  }), [title, text, secondaryText, tone, layout, cardFormat, resolvedCharacter, resolvedMemeFlavor, resolvedAesthetic, resolvedArtifactType, referenceStillFamily, activeReferenceStillFamily, generationGuidance, visualGeneration, rednoteCopy, selected]);

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
    setBusy(true); setError(""); setStatus("MemeForge is shaping the shareable object…");
    try {
      const generated = await generateVisualObject({
        moment: moment.trim(),
        character: resolvedCharacter.trim(),
        memeFlavor: resolvedMemeFlavor,
        aesthetic: resolvedAesthetic,
        artifactType: resolvedArtifactType,
        tone,
        layout,
        guidance: generationGuidance || undefined,
        source: sourceContext,
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

  const exportPng = async () => {
    if (!previewNode) {
      setError("The live preview is unavailable. Try again.");
      return;
    }
    setBusy(true); setStatus("Preparing a 1080 × 1350 PNG…"); setError("");
    try { await exportMiddleEarthPng(draft, previewNode); setStatus("PNG downloaded. No packet was saved."); }
    catch (exportError) { setError(exportError instanceof Error ? exportError.message : "Export failed."); }
    finally { setBusy(false); }
  };

  const savePacket = async () => {
    if (!isAdmin) return;
    if (!text.trim() || !secondaryText.trim()) {
      setError("The reaction card needs both its setup and punchline before it can be saved.");
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
      await onCreatePacket(draft);
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
        <div className={styles.eyebrow}><span className={styles.rune} aria-hidden="true">—</span> MemeForge / separate workbench <span className={styles.rule} /></div>
        <h1><small>Middle-earth</small><br /><em>MemeForge</em></h1>
        <p className={styles.intro}>A Middle-earth fandom angle generator, separate from C-drama Vibe Atlas and its CREATE handoff. Say the moment badly. MemeForge finds the bit, then grounds it in a recognizable reaction image. Captions stay original.</p>
      </header>

      <section className={styles.modeSwitch} aria-label="Creation mode">
        <button className={activeStep === "forge" ? styles.modeActive : ""} onClick={() => selectStep("forge")} disabled={busy}>1. MemeForge <small>translate, then forge</small></button>
        <button className={activeStep === "spellbook" ? styles.modeActive : ""} onClick={() => selectStep("spellbook")} disabled={busy}>2. Rednote Spellbook <small>title · caption · tags</small></button>
      </section>

      <section className={styles.momentPrompt} aria-labelledby="moment-heading">
        <div>
          <div className={styles.sectionKicker}>01 / meme translation</div>
          <h2 id="moment-heading">What moment are we forging?</h2>
          <p>Say the moment badly. MemeForge finds the archetype.</p>
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
            ? <button className={styles.translateAction} type="button" onClick={() => void translateMoment()} disabled={busy || !moment.trim()}>{busy ? "Translating…" : "Translate moment"}</button>
            : <a className={styles.stagingLink} href="/vibe-atlas?view=plan">Sign in to translate</a>}
        </div>
        {translation && <div className={styles.translationResult}>
          <div><span>You asked</span><strong>{moment}</strong></div>
          <div><span>Translated as</span><strong>{translation.translatedMoment}</strong></div>
          <div className={styles.translationDetails}>
            <div><span>Scene</span><p>{translation.scene}</p></div>
            <div><span>Archetype</span><p>{translation.memeFlavor} · {translation.character}</p></div>
            <div><span>Vibe</span><p>{translation.tone} · {translation.aesthetic}</p></div>
          </div>
        </div>}
      </section>

      <div className={styles.layout}>
        <aside className={styles.searchRail}>
          <div className={styles.sectionKicker}>02 / choose reaction image</div>
          {translation ? <>
            <label>
              Reaction still family
              <select
                value={referenceStillFamily ?? ""}
                onChange={(event) => {
                  const nextFamily = event.target.value as ReferenceStillFamilyId;
                  if (!nextFamily || nextFamily === referenceStillFamily) return;
                  const nextQuery = referenceStillSearchQuery(nextFamily);
                  setReferenceStillFamily(nextFamily);
                  setQuery(nextQuery);
                  setSelected(undefined);
                  setPreviewImageFailed(false);
                  invalidateGeneratedVisual();
                  void search(undefined, nextQuery);
                }}
                disabled={busy || searching}
              >
                {referenceStillFamilies.map((family) => <option key={family.id} value={family.id}>{family.label}</option>)}
              </select>
            </label>
            {activeReferenceStillFamily && <div className={styles.sourceNote}><span className={styles.dot} /> <strong>{activeReferenceStillFamily.label}</strong> · {activeReferenceStillFamily.description}</div>}
            <form className={styles.searchForm} onSubmit={search}>
              <label htmlFor="archive-search">Search reaction images</label>
              <div className={styles.searchBox}>
                <input id="archive-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try “Sam carrying Frodo reaction still”" disabled={busy || searching} />
                <button type="submit" aria-label="Search the archive" disabled={busy || searching || !query.trim()}>Search</button>
              </div>
            </form>
            <div className={styles.suggestions}>
              {suggestions.map((group) => <div key={group.label}><span>{group.label}</span><div className={styles.chips}>{group.items.map((item) => <button key={item} onClick={() => { setQuery(item); void search(undefined, item); }} disabled={busy || searching}>{item}</button>)}</div></div>)}
            </div>
            <div className={styles.sourceNote}><span className={styles.dot} /> The still grounds the visual after the angle is chosen; it never decides or rewrites the joke. Always check the original publisher before sharing.</div>
          </> : <div className={styles.sourceNote}>Translate the moment first to find its reaction-image candidates.</div>}
        </aside>

        <section className={styles.archive} aria-live="polite">
          <div className={styles.archiveHead}><div><div className={styles.sectionKicker}>03 / reaction candidates</div><h2>{searchedQuery ? `Choose reaction image for “${searchedQuery}”` : "The image comes after the angle"}</h2></div>{results.length > 0 && <span className={styles.count}>{results.length} candidates</span>}</div>
          {searching && <div className={styles.loadingGrid} aria-label="Loading archive records">{[1, 2, 3, 4].map((item) => <div key={item} className={styles.skeleton} />)}</div>}
          {!searching && error && !results.length && <div className={styles.state}><strong>Something interrupted the search.</strong><p>{error}</p><button onClick={() => void search()}>Try again</button></div>}
           {!searching && !error && !results.length && <div className={styles.empty}><span>Reaction image note</span><strong>{searchedQuery ? "Nothing surfaced this time." : translation ? "The angle is ready. MemeForge will look for a small set of recognizable reaction stills." : "Translate the moment above first."}</strong><p>Every candidate keeps its source attached, so the trail back is never lost.</p></div>}
          {!searching && results.length > 0 && <div className={styles.gallery}>{results.map((asset) => <button key={asset.id} className={`${styles.result} ${selected?.id === asset.id ? styles.resultSelected : ""}`} onClick={() => { setSelected(asset); setVisualGeneration(undefined); setPreviewImageFailed(false); setPacketSaved(false); setStatus(`Selected “${asset.title}”. Generate the visual object with this source.`); }} aria-pressed={selected?.id === asset.id} disabled={busy}><span className={styles.imageWrap}><img src={asset.thumbnail} alt="" onError={(event) => { event.currentTarget.style.display = "none"; const fallback = event.currentTarget.nextElementSibling as HTMLElement | null; if (fallback) fallback.style.visibility = "visible"; }} /><span className={styles.imageFallback}>Image<br />unavailable</span></span><span className={styles.resultTitle}>{asset.title}</span><span className={styles.publisher}>{asset.publisher || "Unknown publisher"}</span></button>)}</div>}
        </section>

        <section className={styles.forge}>
          <div className={styles.sectionKicker}>04 / forge, then finish</div>
          <div className={styles.forgeHead}>
            <h2>{activeStep === "forge" ? "MemeForge" : "Rednote Spellbook"}</h2>
            <span className={styles.liveMark}>{activeStep === "forge" ? "Shareable object" : "Copy package"}</span>
          </div>

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
              ? <div className={styles.flavorBrief}><span>{selectedFlavor.coreEmotion}</span><p>{selectedFlavor.socialSituation}</p><small>Original archetype only · no raw template recreation</small></div>
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

          {activeStep === "forge" ? <>
            <div className={styles.aiPanel}>
                <div><strong>Forge the reaction card</strong><p>Uses the translated moment first, then the selected reaction still as its visual anchor. The original card copy remains yours to edit.</p></div>
              {isAdmin
                ? <button className={styles.aiAction} onClick={() => void generateVisual()} disabled={busy || !translation}>{busy ? "Generating…" : visualGeneration ? "Reforge card" : "Forge card"}</button>
                : <a className={styles.stagingLink} href="/vibe-atlas?view=plan">Sign in to generate</a>}
            </div>
            {cardFormat && <div className={styles.cardFormat}><span>Reaction format</span><strong>{cardFormat}</strong><p>Two lines only: setup, then punchline. Keep longer interpretation in “Translated as.”</p></div>}
            <label>Tiny footer <small className={styles.optional}>optional</small><input value={title} onChange={(event) => { setTitle(event.target.value); setPacketSaved(false); }} maxLength={45} disabled={busy} /></label>
            <label>Setup line<textarea value={text} onChange={(event) => { setText(event.target.value); setPacketSaved(false); }} rows={2} maxLength={36} disabled={busy} /></label>
            <label>Punchline / reaction line<input value={secondaryText} onChange={(event) => { setSecondaryText(event.target.value); setPacketSaved(false); }} maxLength={36} disabled={busy} /></label>
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

          <div className={styles.preview} data-layout={layout} ref={setPreviewNode} aria-label="Live 4 by 5 preview">
            {selected && !previewImageFailed && <img src={selected.thumbnail} alt="" onError={() => setPreviewImageFailed(true)} />}
            <div className={styles.previewShade} />
              <div className={styles.previewCopy}><span>{(cardFormat || resolvedArtifactType || "Reaction card").toUpperCase()} · {resolvedCharacter.toUpperCase()}</span><strong style={cardCopyStyle(text || "Your setup belongs here.")}>{text || "Your setup belongs here."}</strong>{secondaryText && <em style={cardCopyStyle(secondaryText)}>{secondaryText}</em>}</div>
            {title && <small>{title}</small>}
          </div>
          {selected && <div className={styles.provenance}><strong>Source attached</strong><span>{selected.title}</span><span>{selected.publisher || "Publisher unknown"} · {selected.provider || "Provider unknown"}</span><a href={selected.url} target="_blank" rel="noreferrer">Open original source</a><small>Rights status: unknown. This is a personal draft; confirm permission before publishing.</small></div>}
           {selected && <button className={styles.typeFallback} type="button" onClick={() => { setSelected(undefined); setVisualGeneration(undefined); setPacketSaved(false); setStatus("Typography-only fallback selected. Choose a reaction image any time to restore image-backed rendering."); }} disabled={busy}>Use typography-only fallback</button>}
           {!selected && <div className={styles.provenanceMuted}>Typography-only fallback is active. Choose a reaction image to restore image-backed rendering.</div>}
          <p className={styles.handoffNote}><strong>Your generated draft stays here.</strong> PNG export is independent. Packet staging is an optional handoff to the CREATE workflow.</p>
          <div className={styles.actions}>
            <button className={styles.export} onClick={() => void exportPng()} disabled={busy}>{busy ? "Working…" : "Export PNG"}</button>
            {isAdmin
              ? <button className={styles.save} onClick={() => void savePacket()} disabled={busy}>Stage for CREATE</button>
              : <a className={styles.stagingLink} href="/vibe-atlas?view=plan">Sign in through packet staging</a>}
            {packetSaved && <a className={styles.stagingLink} href="/vibe-atlas?view=plan">Open packet staging</a>}
          </div>
          <div className={styles.status} role="status">{error && <span className={styles.statusError}>{error}</span>}{!error && status}</div>
        </section>
      </div>
    </main>
  );
}