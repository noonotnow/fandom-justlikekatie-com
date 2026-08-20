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
