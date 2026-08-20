import { useMemo, useState, type FormEvent } from "react";
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
  tone: string;
  layout: string;
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
const spellbookTones = ["Field note", "Lyrical", "Wry", "Prophetic"];
const spellbookLayouts = ["Quote card", "Type specimen", "Marginalia"];

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

export async function exportMiddleEarthPng(
  draft: MiddleEarthDraft,
  target: HTMLElement,
): Promise<void> {
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

  const image = draft.asset?.thumbnail
    ? await new Promise<HTMLImageElement | null>((resolve) => {
        const loaded = new Image();
        loaded.crossOrigin = "anonymous";
        loaded.onload = () => resolve(loaded);
        loaded.onerror = () => resolve(null);
        loaded.src = draft.asset?.thumbnail ?? "";
      })
    : null;
  if (image) {
    const ratio = Math.max(1080 / image.width, 660 / image.height);
    const width = image.width * ratio;
    const height = image.height * ratio;
    context.save();
    context.globalAlpha = 0.86;
    context.drawImage(image, (1080 - width) / 2, 105, width, height);
    context.restore();
  }
  context.fillStyle = "#102f30";
  context.fillRect(72, 72, 936, image ? 625 : 950);
  context.fillStyle = "#f4eee2";
  context.textAlign = "left";
  context.font = "600 25px Georgia";
  context.fillText(draft.kind === "meme" ? "MIDDLE-EARTH / MEME FORGE" : "MIDDLE-EARTH / SPELLBOOK", 112, image ? 635 : 170);
  context.font = "700 66px Georgia";
  const lines = draft.text.split(/\n/);
  lines.slice(0, 5).forEach((line, index) => context.fillText(line.slice(0,  thirtyChars), 112, (image ? 760 : 290) + index * 78));
  if (draft.secondaryText) {
    context.fillStyle = "#d4b068";
    context.font = "500 30px Georgia";
    context.fillText(draft.secondaryText.slice(0, 68), 112, image ? 1180 : 820);
  }
  context.fillStyle = "#193b3b";
  context.font = "500 20px monospace";
  context.fillText(draft.title.toUpperCase().slice(0, 54), 112, 1265);
  if (!target) throw new Error("Preview unavailable.");
  const link = document.createElement("a");
  link.download = `${draft.title || "middle-earth-packet"}.png`.replace(/[^a-z0-9-_]+/gi, "-");
  link.href = canvas.toDataURL("image/png");
  link.click();
}

const thirtyChars = 34;

export function MiddleEarthWorkspace({ isAdmin, onCreatePacket }: {
  isAdmin: boolean;
  onCreatePacket: (draft: MiddleEarthDraft) => Promise<void>;
}) {
  const [kind, setKind] = useState<MiddleEarthContentKind>("meme");
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [results, setResults] = useState<MiddleEarthAsset[]>([]);
  const [selected, setSelected] = useState<MiddleEarthAsset>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [title, setTitle] = useState("A small truth from the road");
  const [text, setText] = useState("One does not simply leave the group chat.");
  const [secondaryText, setSecondaryText] = useState("— a very reasonable fellowship decision");
  const [tone, setTone] = useState(memeTones[0]);
  const [layout, setLayout] = useState(memeLayouts[0]);
  const [previewImageFailed, setPreviewImageFailed] = useState(false);
  const [previewNode, setPreviewNode] = useState<HTMLElement | null>(null);

  const currentTones = kind === "meme" ? memeTones : spellbookTones;
  const currentLayouts = kind === "meme" ? memeLayouts : spellbookLayouts;
  const isTypography = kind === "spellbook" && layout === "Type specimen";

  const search = async (event?: FormEvent, requestedQuery?: string) => {
    event?.preventDefault();
    const clean = (requestedQuery ?? query).trim();
    if (!clean) return;
    setBusy(true); setError(""); setStatus("");
    try {
      const response = await fetch(`/.netlify/functions/middle-earth-search?q=${encodeURIComponent(clean)}`);
      if (!response.ok) throw new Error("The archive did not answer. Try that search again.");
      const payload = await response.json() as SearchResponse;
      setResults(payload.results.map((result, index) => makeAsset(result, payload.query || clean, index)));
      setSearchedQuery(payload.query || clean);
      setSelected(undefined);
      setStatus(payload.results.length ? `${payload.results.length} archive ${payload.results.length === 1 ? "record" : "records"} found.` : "No records found.");
    } catch (searchError) {
      setResults([]); setError(searchError instanceof Error ? searchError.message : "The archive is unavailable.");
    } finally { setBusy(false); }
  };

  const selectKind = (next: MiddleEarthContentKind) => {
    setKind(next);
    setTone(next === "meme" ? memeTones[0] : spellbookTones[0]);
    setLayout(next === "meme" ? memeLayouts[0] : spellbookLayouts[0]);
    setStatus("");
  };

  const draft = useMemo<MiddleEarthDraft>(() => ({
    kind, title: title.trim() || "Untitled Middle-earth idea", text: text.trim(),
    secondaryText: secondaryText.trim() || undefined, tone, layout, asset: selected, createdAt: new Date().toISOString(),
  }), [kind, title, text, secondaryText, tone, layout, selected]);

  const exportPng = async () => {
    if (!activePreview) return;
    setBusy(true); setStatus("Preparing a 1080 × 1350 PNG…"); setError("");
    try { await exportMiddleEarthPng(draft, activePreview); setStatus("PNG downloaded. No packet was saved."); }
    catch (exportError) { setError(exportError instanceof Error ? exportError.message : "Export failed."); }
    finally { setBusy(false); }
  };

  const savePacket = async () => {
    if (!isAdmin) return;
    setBusy(true); setStatus("Staging your idea packet…"); setError("");
    try { await onCreatePacket(draft); setStatus("Idea packet staged in the workbench."); }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : "The packet could not be staged."); }
    finally { setBusy(false); }
  };

  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div className={styles.eyebrow}><span className={styles.rune} aria-hidden="true">—</span> Katie's private archive <span className={styles.rule} /></div>
        <h1>Middle-earth<br /><em>workbench</em></h1>
        <p className={styles.intro}>Search the visual record. Find the feeling. Turn it into something worth sending.</p>
      </header>

      <section className={styles.modeSwitch} aria-label="Creation mode">
        <button className={kind === "meme" ? styles.modeActive : ""} onClick={() => selectKind("meme")} disabled={busy}>Meme Forge <small>quick fire</small></button>
        <button className={kind === "spellbook" ? styles.modeActive : ""} onClick={() => selectKind("spellbook")} disabled={busy}>Quote &amp; Caption Spellbook <small>for the margins</small></button>
      </section>

      <div className={styles.layout}>
        <aside className={styles.searchRail}>
          <div className={styles.sectionKicker}>01 / consult the archive</div>
          <form className={styles.searchForm} onSubmit={search}>
            <label htmlFor="archive-search">Search visual evidence</label>
            <div className={styles.searchBox}>
              <input id="archive-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try “Rivendell at dusk”" disabled={busy} />
              <button type="submit" aria-label="Search the archive" disabled={busy || !query.trim()}>Search</button>
            </div>
          </form>
          <div className={styles.suggestions}>
            {suggestions.map((group) => <div key={group.label}><span>{group.label}</span><div className={styles.chips}>{group.items.map((item) => <button key={item} onClick={() => { setQuery(item); void search(undefined, item); }} disabled={busy}>{item}</button>)}</div></div>)}
          </div>
          <div className={styles.sourceNote}><span className={styles.dot} /> Source records are gathered live. Always check the original publisher before sharing.</div>
        </aside>

        <section className={styles.archive} aria-live="polite">
          <div className={styles.archiveHead}><div><div className={styles.sectionKicker}>02 / visual evidence</div><h2>{searchedQuery ? `Records for “${searchedQuery}”` : "The archive is waiting"}</h2></div>{results.length > 0 && <span className={styles.count}>{results.length} records</span>}</div>
          {busy && <div className={styles.loadingGrid} aria-label="Loading archive records">{[1, 2, 3, 4].map((item) => <div key={item} className={styles.skeleton} />)}</div>}
          {!busy && error && <div className={styles.state}><strong>Something interrupted the search.</strong><p>{error}</p><button onClick={() => void search()}>Try again</button></div>}
          {!busy && !error && !results.length && <div className={styles.empty}><span>Archive note</span><strong>{searchedQuery ? "Nothing surfaced this time." : "Begin with a place, person, or mood."}</strong><p>Search results will keep their source attached, so the trail back is never lost.</p></div>}
          {!busy && results.length > 0 && <div className={styles.gallery}>{results.map((asset) => <button key={asset.id} className={`${styles.result} ${selected?.id === asset.id ? styles.resultSelected : ""}`} onClick={() => { setSelected(asset); setPreviewImageFailed(false); setStatus(`Selected “${asset.title}”.`); }} aria-pressed={selected?.id === asset.id}><span className={styles.imageWrap}><img src={asset.thumbnail} alt="" onError={(event) => { event.currentTarget.style.display = "none"; const fallback = event.currentTarget.nextElementSibling as HTMLElement | null; if (fallback) fallback.style.visibility = "visible"; }} /><span className={styles.imageFallback}>Image<br />unavailable</span></span><span className={styles.resultTitle}>{asset.title}</span><span className={styles.publisher}>{asset.publisher || "Unknown publisher"}</span></button>)}</div>}
        </section>

        <section className={styles.forge}>
          <div className={styles.sectionKicker}>03 / make it yours</div>
          <div className={styles.forgeHead}><h2>{kind === "meme" ? "Meme Forge" : "Quote & Caption Spellbook"}</h2><span className={styles.liveMark}>Live preview</span></div>
          <label>Working title<input value={title} onChange={(event) => setTitle(event.target.value)} disabled={busy} /></label>
          <label>{kind === "meme" ? "Primary text" : "The line"}<textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} disabled={busy} /></label>
          <label>{kind === "meme" ? "Secondary text" : "Attribution or whisper"}<input value={secondaryText} onChange={(event) => setSecondaryText(event.target.value)} disabled={busy} /></label>
          <div className={styles.choiceGroup}><span>Tone</span><div>{currentTones.map((option) => <button key={option} className={tone === option ? styles.choiceActive : ""} onClick={() => setTone(option)} disabled={busy}>{option}</button>)}</div></div>
          <div className={styles.choiceGroup}><span>{kind === "meme" ? "Layout" : "Category"}</span><div>{currentLayouts.map((option) => <button key={option} className={layout === option ? styles.choiceActive : ""} onClick={() => setLayout(option)} disabled={busy}>{option}</button>)}</div></div>
          {kind === "spellbook" && <label className={styles.check}><input type="checkbox" checked={isTypography} onChange={() => setLayout(isTypography ? "Quote card" : "Type specimen")} disabled={busy} /> Typography-only treatment</label>}

          <div className={`${styles.preview} ${isTypography ? styles.typographyPreview : ""}`} ref={setPreviewNode} aria-label="Live 4 by 5 preview">
            {!isTypography && selected && !previewImageFailed && <img src={selected.thumbnail} alt="" onError={() => setPreviewImageFailed(true)} />}
            <div className={styles.previewShade} />
            <div className={styles.previewCopy}><span>{kind === "meme" ? "MIDDLE-EARTH / MEME FORGE" : "MIDDLE-EARTH / SPELLBOOK"}</span><strong>{text || "Your words belong here."}</strong>{secondaryText && <em>{secondaryText}</em>}</div>
            <small>{title}</small>
          </div>
          {selected && <div className={styles.provenance}><strong>Source attached</strong><span>{selected.title}</span><span>{selected.publisher || "Publisher unknown"} · {selected.provider || "Provider unknown"}</span><a href={selected.url} target="_blank" rel="noreferrer">Open original source</a><small>Rights status: unknown. This is a personal draft; confirm permission before publishing.</small></div>}
          {!selected && <div className={styles.provenanceMuted}>No source selected. You can still make a typography-only draft.</div>}
          <div className={styles.actions}><button className={styles.export} onClick={() => void exportPng()} disabled={busy}>{busy ? "Working…" : "Export PNG"}</button>{isAdmin ? <button className={styles.save} onClick={() => void savePacket()} disabled={busy}>Save Idea Packet</button> : <p>Local export works here. CREATE packet staging requires sign-in.</p>}</div>
          <div className={styles.status} role="status">{error && <span className={styles.statusError}>{error}</span>}{!error && status}</div>
        </section>
      </div>
    </main>
  );
}