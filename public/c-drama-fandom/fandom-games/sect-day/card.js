import { endingById } from "./story.js";
export function wrap(ctx, value, width) {
  const lines = []; let line = "";
  for (const word of value.split(/\s+/)) {
    const next = line ? line + " " + word : word;
    if (line && ctx.measureText(next).width > width) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
// Returns layout evidence so browser tests can verify all text, not truncated slices.
export function drawCard(canvas, id) {
  const ending = endingById(id);
  if (!ending) throw new Error("Unknown ending");
  canvas.width = 1080; canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.fillStyle = "#061321"; ctx.fillRect(0, 0, 1080, 1350);
  ctx.strokeStyle = "#d5ac58"; ctx.lineWidth = 3; ctx.strokeRect(60, 60, 960, 1230);
  let y = 125;
  const layout = [];
  function block(text, font, color, step, gap = 28) {
    ctx.font = font; ctx.fillStyle = color;
    for (const line of wrap(ctx, text, 860)) {
      ctx.fillText(line, 110, y);
      layout.push({ text: line, y, width: ctx.measureText(line).width });
      y += step;
    }
    y += gap;
  }
  block("FANDOM VIBES / FIRST SECT DAY", "700 26px sans-serif", "#d5ac58", 36);
  block(ending.name, "bold 66px Georgia", "#f3eee5", 78);
  block(ending.description, "34px sans-serif", "#dce5e8", 48);
  block("SURVIVAL TACTIC · " + ending.tactic, "30px sans-serif", "#d5ac58", 42);
  block("ALLY · " + ending.ally, "30px sans-serif", "#dce5e8", 42);
  if (y > 1195) throw new Error("Card text exceeds safe area");
  ctx.font = "25px sans-serif"; ctx.fillStyle = "#d5ac58";
  ctx.fillText("CAN YOU SURVIVE YOUR FIRST DAY IN A SECT?", 110, 1210);
  ctx.fillStyle = "#dce5e8"; ctx.font = "24px sans-serif";
  ctx.fillText("fandom.justlikekatie.com · A generic ending, not a decision trail", 110, 1252);
  return layout;
}
