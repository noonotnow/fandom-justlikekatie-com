import type { CreateReceipt, IdeaPacket, PacketMedia, PacketOutput } from './ideaPackets.ts';

export const CREATE_HANDOFF_URL = '/api/create-handoff';
export const CREATE_RENDER_CONTRACT = 'fandom.idea-packet-output.v1';
export const CREATE_RENDER_VERSION = 1;
export const CREATE_RENDER_WIDTH = 1080;
export const CREATE_RENDER_HEIGHT = 1350;

type Fetch = typeof fetch;

export interface RenderedPacketOutput {
  output: PacketOutput;
  blob: Blob;
  filename: string;
}

export function packetIndividualRenderInput(packet: IdeaPacket, media: PacketMedia) {
  return {
    actorName: packet.actor.name,
    vibeEmoji: packet.vibe.emoji,
    vibeLabel: packet.vibe.label,
    vibeLabelEn: packet.vibe.labelEn,
    date: new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(packet.provenance.generatedAt)),
    imageUrl: media.imageUrl,
  };
}

export async function loadRequiredGridImages<T>(
  packet: IdeaPacket,
  loader: (url: string, label: string) => Promise<T>,
): Promise<T[]> {
  return Promise.all(packet.sourceCards.slice(0, 9).map(card => loader(card.imageUrl, card.title)));
}

export async function completeIdeaPacketHandoff(
  packet: IdeaPacket,
  render: (packet: IdeaPacket) => Promise<RenderedPacketOutput[]>,
  send: (
    packet: IdeaPacket,
    rendered: RenderedPacketOutput[],
  ) => Promise<CreateReceipt> = sendIdeaPacketToCreate,
): Promise<CreateReceipt> {
  const rendered = await render(packet);
  return send(packet, rendered);
}

export async function sendIdeaPacketToCreate(
  packet: IdeaPacket,
  rendered: RenderedPacketOutput[],
  fetchImpl: Fetch = fetch,
): Promise<CreateReceipt> {
  const expected = packet.outputs.filter(output => output.included);
  if (rendered.length !== expected.length || rendered.some((item, index) => item.output.id !== expected[index].id)) {
    throw new Error('Rendered output order no longer matches this Idea Packet. Refresh and try again.');
  }

  const manifest = {
    packetId: packet.id,
    expectedVersion: packet.version,
    outputs: rendered.map(item => ({
      outputId: item.output.id,
      kind: item.output.kind,
      sourceId: item.output.sourceId,
      renderContract: CREATE_RENDER_CONTRACT,
      renderVersion: CREATE_RENDER_VERSION,
      width: CREATE_RENDER_WIDTH,
      height: CREATE_RENDER_HEIGHT,
    })),
  };

  const response = await fetchImpl(CREATE_HANDOFF_URL, {
    method: 'POST',
    headers: { ...operatorHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(manifest),
  });
  const body = await readJson(response);
  if (!response.ok) {
    const error = stringField(body, 'error') || `CREATE handoff failed (HTTP ${response.status})`;
    const stage = stringField(body, 'stage');
    throw new Error(stage ? `${error} (${stage} stage)` : error);
  }
  return validateReceipt(body, packet.id);
}

function operatorHeaders(): Record<string, string> {
  const token = typeof sessionStorage === 'undefined' ? '' : sessionStorage.getItem('plan_operator_token') ?? '';
  return token ? { Authorization: 'Bearer ' + token } : {};
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`CREATE handoff returned invalid JSON (HTTP ${response.status})`);
  }
}

function validateReceipt(value: unknown, packetId: string): CreateReceipt {
  if (!value || typeof value !== 'object') throw new Error('CREATE handoff returned an invalid receipt.');
  const receipt = Reflect.get(value, 'receipt');
  if (!receipt || typeof receipt !== 'object') throw new Error('CREATE handoff returned an invalid receipt.');
  const createUrl = stringField(receipt, 'createUrl');
  const postId = stringField(receipt, 'postId');
  let parsed: URL;
  try {
    parsed = new URL(createUrl);
  } catch {
    throw new Error('CREATE handoff returned an invalid Open in CREATE URL.');
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.hostname !== 'create.justlikekatie.com'
    || parsed.pathname !== '/compose'
    || parsed.searchParams.get('postId') !== postId
    || stringField(receipt, 'status') !== 'Draft'
    || stringField(receipt, 'workflow') !== 'packet'
    || Reflect.get(receipt, 'packetReceipt')?.packetId !== packetId
  ) {
    throw new Error('CREATE handoff returned an invalid receipt.');
  }
  return receipt as CreateReceipt;
}

function stringField(value: unknown, field: string): string {
  if (!value || typeof value !== 'object') return '';
  const candidate = Reflect.get(value, field);
  return typeof candidate === 'string' ? candidate : '';
}
