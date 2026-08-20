import { renderCard } from './cardRenderer';
import { renderExportCanvas } from './exportCanvas';
import { starDataFromCollectionGrid } from './collectionHistoryModel';
import {
  includedPacketOutputs,
  type IdeaPacket,
  type PacketMedia,
  type PacketOutput,
} from './ideaPackets';
import {
  packetIndividualRenderInput,
  type RenderedPacketOutput,
} from './createHandoffClient';

export {
  CREATE_HANDOFF_URL,
  sendIdeaPacketToCreate,
  type RenderedPacketOutput,
} from './createHandoffClient';

export async function renderPacketOutputs(packet: IdeaPacket): Promise<RenderedPacketOutput[]> {
  const rendered: RenderedPacketOutput[] = [];
  for (const output of includedPacketOutputs(packet)) {
    let blob: Blob;
    if (output.kind === 'grid') {
      blob = await renderPacketGridPng(packet, output);
    } else if (output.kind === 'meme' || output.kind === 'spellbook') {
      blob = await renderMiddleEarthOutputPng(packet, output);
    } else {
      blob = await renderPacketIndividualPng(packet, requirePacketMedia(packet, output));
    }
    rendered.push({
      output,
      blob,
      filename: `idea-packet-${packet.id}-${output.id}.png`,
    });
  }
  return rendered;
}

export async function renderPacketIndividualPng(
  packet: IdeaPacket,
  media: PacketMedia,
  render = renderCard,
): Promise<Blob> {
  return render(packetIndividualRenderInput(packet, media));
}

export async function renderPacketGridPng(
  packet: IdeaPacket,
  output?: PacketOutput,
): Promise<Blob> {
  const sourceId = output?.sourceId
    || includedPacketOutputs(packet).find(candidate => candidate.kind === 'grid')?.sourceId;
  const grid = packet.grids.find(candidate => candidate.id === sourceId);
  if (!grid) throw new Error('Selected grid output no longer has its saved grid artifact.');
  const canvas = await renderExportCanvas(starDataFromCollectionGrid(grid), 'full');
  return canvasToBlob(canvas);
}

/**
 * Renders a Middle-earth meme or spellbook output as a 1080×1350 PNG blob.
 * Uses the structured text content from packet.middleEarthContent when available,
 * falling back to a placeholder canvas for graceful degradation.
 */
export async function renderMiddleEarthOutputPng(
  packet: IdeaPacket,
  output: PacketOutput,
): Promise<Blob> {
  const content = packet.middleEarthContent?.[output.id];
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context for Middle-earth render.');

  // Background
  ctx.fillStyle = '#0e0e12';
  ctx.fillRect(0, 0, 1080, 1350);

  if (content) {
    // Title
    ctx.fillStyle = '#c9a96e';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(content.title, 540, 120);

    // Kind badge
    const kindLabel = content.kind === 'meme' ? '⚔️ Middle-earth Meme Forge' : '📖 Quote Spellbook';
    ctx.fillStyle = '#a3a3ad';
    ctx.font = '24px sans-serif';
    ctx.fillText(kindLabel, 540, 80);

    // Main text — word-wrapped
    ctx.fillStyle = '#f0ede8';
    ctx.font = '32px sans-serif';
    const words = content.text.split(' ');
    let line = '';
    let y = 200;
    const maxWidth = 900;
    const lineHeight = 44;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, 540, y);
        line = word;
        y += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, 540, y);

    // Secondary text
    if (content.secondaryText) {
      ctx.fillStyle = '#a3a3ad';
      ctx.font = '24px sans-serif';
      ctx.fillText(content.secondaryText, 540, y + 60);
    }

    // Tone / layout metadata
    ctx.fillStyle = '#777782';
    ctx.font = '18px sans-serif';
    ctx.fillText(`${content.tone} · ${content.layout}`, 540, 1300);
  } else {
    ctx.fillStyle = '#a3a3ad';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(output.label, 540, 675);
  }

  return canvasToBlob(canvas);
}

function requirePacketMedia(packet: IdeaPacket, output: PacketOutput): PacketMedia {
  const media = packet.media.find(item => item.id === output.sourceId);
  if (!media) throw new Error(`Selected output "${output.label}" no longer has source media.`);
  return media;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('The rendered grid PNG could not be generated.'));
    }, 'image/png');
  });
}
