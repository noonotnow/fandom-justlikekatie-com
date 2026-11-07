import { useEffect, useRef, useState } from "react";
import { renderMiddleEarthMeme, type MemeCanvasDraft } from "../../utils/middleEarthMemeCanvas";

export function MemeCanvasPreview({ draft }: { draft: MemeCanvasDraft & { asset?: { thumbnail: string } } }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const context = canvas.current?.getContext("2d");
    if (!context) { setError("Your browser could not prepare the meme preview."); return; }
    setError("");
    renderMiddleEarthMeme(context, null, draft);
    if (!draft.asset?.thumbnail) return;
    const image = new Image();
    const timer = setTimeout(() => {
      if (active) { active = false; setError("Image preview timed out. Choose another still or upload your own."); }
    }, 12000);
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (!active) return;
      clearTimeout(timer);
      if (!image.naturalWidth) { setError("The selected image has no pixels."); return; }
      renderMiddleEarthMeme(context, image, draft);
    };
    image.onerror = () => {
      if (active) { clearTimeout(timer); setError("Image preview unavailable. Choose another still or upload your own."); }
    };
    image.src = draft.asset.thumbnail;
    return () => { active = false; clearTimeout(timer); image.onload = null; image.onerror = null; };
  }, [draft]);
  return <>
    <canvas ref={canvas} width={1080} height={1080} aria-label="Meme preview: image with caption text, no frame or branding" style={{ display: error ? "none" : "block", width: "100%", height: "auto" }} />
    {error && <p role="alert">{error}</p>}
  </>;
}
