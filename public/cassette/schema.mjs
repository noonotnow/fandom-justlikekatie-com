// The native/local cassette format, shared by the account API and browser.
export const GUEST_KEY = 'qilin-keeper.keepsakes.v1';
export const STICKERS = ['first_flight', 'first_landing'];
export const emptyCassette = () => ({ version: 1, earned: [], placed: {} });

export function cassette(input) {
  if (!input || input.version !== 1 || !Array.isArray(input.earned) ||
      !input.placed || typeof input.placed !== 'object' || Array.isArray(input.placed) ||
      Object.keys(input).some(key => !['version', 'earned', 'placed'].includes(key)) ||
      input.earned.length > STICKERS.length) throw new Error('This cassette file is not supported.');
  const earned = [...new Set(input.earned)];
  if (earned.some(id => !STICKERS.includes(id))) throw new Error('This cassette contains an unknown sticker.');
  const placed = {};
  for (const [id, p] of Object.entries(input.placed)) {
    if (!earned.includes(id) || !p || Object.keys(p).sort().join() !== 'angle,x,y' ||
        ![p.x, p.y, p.angle].every(Number.isFinite) ||
        p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1 || Math.abs(p.angle) > 0.45) {
      throw new Error('This cassette contains an invalid sticker placement.');
    }
    placed[id] = { x: p.x, y: p.y, angle: p.angle };
  }
  return { version: 1, earned: STICKERS.filter(id => earned.includes(id)), placed };
}

export function equalCassette(a, b) {
  return JSON.stringify(cassette(a)) === JSON.stringify(cassette(b));
}

export function accountKey(id) {
  if (!/^usr_[A-Za-z0-9_-]{32}$/.test(id)) throw new Error('Invalid account identity.');
  return `qilin-keeper.keepsakes.account.${id}.v1`;
}
