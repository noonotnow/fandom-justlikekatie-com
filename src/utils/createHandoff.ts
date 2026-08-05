import { renderCard } from './cardRenderer';
import {
  includedPacketOutputs,
  type IdeaPacket,
  type PacketMedia,
  type PacketOutput,
} from './ideaPackets';
import {
  loadRequiredGridImages,
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
    const blob = output.kind === 'grid'
      ? await renderPacketGridPng(packet)
      : await renderPacketIndividualPng(packet, requirePacketMedia(packet, output));
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
  imageLoader: (url: string, label: string) => Promise<HTMLImageElement> = loadRequiredImage,
): Promise<Blob> {
  const images = await loadRequiredGridImages(packet, imageLoader);
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Grid rendering is unavailable in this browser.');

  context.fillStyle = '#0e0e12';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textAlign = 'center';
  context.fillStyle = '#c9a96e';
  context.font = '600 28px "Noto Sans SC", "Inter", sans-serif';
  context.fillText('今日氛围图鉴 · IDEA PACKET', canvas.width / 2, 72);
  context.fillStyle = '#f0ede8';
  context.font = '700 44px "Noto Sans SC", "Inter", sans-serif';
  context.fillText(`${packet.vibe.emoji} ${packet.actor.name} · ${packet.vibe.label}`, canvas.width / 2, 132);

  const gap = 8;
  const left = 56;
  const top = 190;
  const tile = (canvas.width - left * 2 - gap * 2) / 3;
  images.forEach((image, index) => {
    const x = left + (index % 3) * (tile + gap);
    const y = top + Math.floor(index / 3) * (tile + gap);
    context.fillStyle = '#1a1a22';
    context.fillRect(x, y, tile, tile);
    drawCover(context, image, x, y, tile, tile);
  });

  context.fillStyle = '#a3a3ad';
  context.font = '400 22px "Inter", "Noto Sans SC", sans-serif';
  context.fillText(`${packet.vibe.labelEn} · ${shanghaiDay(packet.provenance.generatedAt)}`, canvas.width / 2, 1268);
  context.fillStyle = '#c9a96e';
  context.font = '600 18px "Inter", sans-serif';
  context.fillText(`FANDOM / ${packet.provenance.gridId}`, canvas.width / 2, 1310);
  return canvasToBlob(canvas);
}

function requirePacketMedia(packet: IdeaPacket, output: PacketOutput): PacketMedia {
  const media = packet.media.find(item => item.id === output.sourceId);
  if (!media) throw new Error(`Selected output "${output.label}" no longer has source media.`);
  return media;
}

function shanghaiDay(value: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function loadRequiredImage(url: string, label: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load "${label}" for the rendered grid. Refresh the source image and try again.`));
    image.src = url;
  });
}

function drawCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  context.drawImage(
    image,
    (sourceWidth - cropWidth) / 2,
    (sourceHeight - cropHeight) / 2,
    cropWidth,
    cropHeight,
    x,
    y,
    width,
    height,
  );
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('The rendered grid PNG could not be generated.'));
    }, 'image/png');
  });
}
