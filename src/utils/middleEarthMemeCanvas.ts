export interface MemeCanvasDraft {
  text: string;
  secondaryText?: string;
  layout: string;
  creationPath?: string;
  memeRework?: { edit: { mode: string } };
}

/** Rework preview and export use the same source-sized, unbranded pixels. */
export function renderMiddleEarthMeme(context: CanvasRenderingContext2D, image: HTMLImageElement | null, draft: MemeCanvasDraft): void {
  const canvas = context.canvas;
  canvas.width = 1080;
  canvas.height = image ? Math.max(1, Math.round(1080 * image.naturalHeight / image.naturalWidth)) : 1080;
  const { width, height } = canvas;
  context.fillStyle = "#111111";
  context.fillRect(0, 0, width, height);
  if (image) context.drawImage(image, 0, 0, width, height);
  const cover = draft.creationPath === "meme-rework" && draft.memeRework?.edit.mode === "cover-and-replace";
  const maxWidth = width * .92;
  const blocks = [draft.text.trim(), draft.secondaryText?.trim() || ""];
  const maxHeight = height * (blocks.every(Boolean) ? .36 : .45);
  blocks.forEach((copy, blockIndex) => {
    if (!copy) return;
    let size = Math.min(76, height * .13);
    let lines: string[] = [];
    const wrap = () => {
      context.font = `900 ${size}px Impact, "Arial Black", sans-serif`;
      lines = [];
      let line = "";
      for (const word of copy.toUpperCase().split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (context.measureText(candidate).width <= maxWidth) { line = candidate; continue; }
        if (line) { lines.push(line); line = ""; }
        for (const char of word) {
          if (line && context.measureText(line + char).width > maxWidth) { lines.push(line); line = ""; }
          line += char;
        }
      }
      if (line) lines.push(line);
    };
    wrap();
    while (lines.length * size * 1.12 > maxHeight && size > 4) { size -= 1; wrap(); }
    const lineHeight = size * 1.12;
    const padding = Math.min(30, height * .035);
    const blockHeight = lines.length * lineHeight;
    const top = blockIndex === 0 ? padding : height - padding - blockHeight;
    if (cover) {
      context.fillStyle = "#111111";
      context.fillRect(0, blockIndex === 0 ? 0 : top - padding, width, blockHeight + padding * 2);
    }
    context.textAlign = "center";
    context.textBaseline = "top";
    context.lineJoin = "round";
    context.lineWidth = Math.max(2, size * .11);
    context.strokeStyle = "#111111";
    context.fillStyle = "#ffffff";
    lines.forEach((line, index) => {
      context.strokeText(line, width / 2, top + index * lineHeight);
      context.fillText(line, width / 2, top + index * lineHeight);
    });
  });
}
