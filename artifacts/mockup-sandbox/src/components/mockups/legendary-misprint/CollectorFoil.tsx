import { useState } from "react";
import { Check, ChevronDown, Download, LockKeyhole, Share2, Sparkles } from "lucide-react";

const mixedGridImage = "/__mockup/images/mixed-grid.png";

export function CollectorFoil() {
  const [collected, setCollected] = useState(true);
  const [showProvenance, setShowProvenance] = useState(false);
  const [shared, setShared] = useState(false);

  function exportArtifact() {
    const link = document.createElement("a");
    link.href = mixedGridImage;
    link.download = "legendary-misprint-vibe-atlas.png";
    link.click();
  }

  async function shareArtifact() {
    const text = "Legendary Misprint · Historical exception — saved by you";
    if (navigator.share) {
      await navigator.share({ title: "Legendary Misprint", text }).catch(() => undefined);
    } else {
      await navigator.clipboard?.writeText(text);
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    }
  }

  return (
    <main className="min-h-[100dvh] overflow-hidden bg-[#eee9dc] px-4 py-6 text-[#1d2831] sm:px-8 sm:py-10">
      <style>{`
        @keyframes foil-shimmer {
          0%, 100% { transform: translateX(-8%) rotate(-10deg); opacity: .35; }
          50% { transform: translateX(8%) rotate(-10deg); opacity: .62; }
        }
        @keyframes float-mark {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .collector-foil::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(118deg, transparent 20%, rgba(255,255,255,.52) 47%, transparent 67%);
          animation: foil-shimmer 7s ease-in-out infinite;
          mix-blend-mode: screen;
        }
        .collector-foil::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: .15;
          background-image: radial-gradient(rgba(29,40,49,.55) .45px, transparent .55px);
          background-size: 5px 5px;
          mix-blend-mode: multiply;
        }
        .misprint-seal {
          position: relative;
          display: grid;
          height: 58px;
          width: 58px;
          place-items: center;
          border: 1px solid rgba(224, 194, 255, .9);
          border-radius: 999px;
          color: #c895ff;
          box-shadow: inset 0 0 0 3px rgba(200, 149, 255, .12), 0 0 0 1px rgba(200, 149, 255, .18);
        }
        .misprint-seal::before {
          content: "";
          position: absolute;
          inset: 4px;
          border: 1.5px dashed rgba(164, 105, 240, .9);
          border-radius: inherit;
          transform: rotate(12deg);
        }
        .misprint-seal::after {
          content: "";
          position: absolute;
          inset: 10px;
          border: 1px solid rgba(200, 149, 255, .44);
          border-radius: 9px;
          transform: rotate(-8deg);
        }
        .misprint-seal-mark {
          position: relative;
          z-index: 1;
          display: grid;
          height: 20px;
          width: 20px;
          place-items: center;
          border: 1px solid rgba(248, 224, 255, .9);
          border-radius: 4px;
          background: rgba(89, 44, 126, .66);
          font-family: ui-monospace, SFMono-Regular, monospace;
          font-size: 16px;
          line-height: 1;
          transform: translate(2px, -2px) rotate(4deg);
        }
        .misprint-seal-mark::after {
          content: "×";
          position: absolute;
          left: -4px;
          top: 3px;
          color: #f1cfff;
          opacity: .52;
          transform: translate(-2px, 1px);
        }
        @media (prefers-reduced-motion: reduce) {
          .collector-foil::before { animation: none; opacity: .25; }
          .float-mark { animation: none !important; }
        }
      `}</style>

      <section className="mx-auto w-full max-w-[560px]">
        <header className="mb-5 flex items-center justify-between px-1 text-[10px] font-bold uppercase tracking-[.2em] text-[#6d746f]">
          <span>Fandom Vibes / Collection</span>
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#b85f4e]" /> Artifact 01</span>
        </header>

        <article className="collector-foil relative isolate overflow-hidden rounded-[26px] border border-[#b8aa88] bg-[#d8c995] p-3 shadow-[0_22px_60px_rgba(45,54,44,.2)] sm:p-4">
          <div className="relative z-10 overflow-hidden rounded-[19px] border border-[#f7f0d0]/80 bg-[#21333c]">
            <div className="flex items-start justify-between px-5 pb-3 pt-4 text-[#f5edc9]">
              <div>
                <p className="mb-1 font-mono text-[9px] uppercase tracking-[.22em] text-[#e7c579]">Legendary Misprint</p>
                <h1 className="font-['Bricolage_Grotesque'] text-[clamp(1.55rem,5vw,2.2rem)] font-semibold leading-[.95] tracking-[-.045em]">The Unscheduled<br />Crossing</h1>
              </div>
              <div className="misprint-seal float-mark shrink-0 [animation:float-mark_4s_ease-in-out_infinite]" role="img" aria-label="Misprint Seal: Legendary Misprint authentication mark" title="Misprint Seal · Legendary Misprint">
                <span className="misprint-seal-mark" aria-hidden="true">×</span>
                <span className="sr-only">Legendary Misprint</span>
              </div>
            </div>

            <div className="mx-3 overflow-hidden rounded-[12px] border border-[#e7c579]/45 bg-[#101d24] p-1 shadow-[0_10px_25px_rgba(8,15,18,.28)] sm:mx-4">
              <img src={mixedGridImage} alt="Preserved mixed grid showing the unexpected Gandalf identity" className="block aspect-square w-full object-cover" />
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-4 px-5 pb-5 pt-4">
              <div>
                <p className="mb-1 text-[9px] font-bold uppercase tracking-[.17em] text-[#e7c579]">Unexpected identity</p>
                <p className="font-['Bricolage_Grotesque'] text-2xl font-semibold tracking-[-.04em] text-[#fff7d5]">Gandalf</p>
              </div>
              <div className="text-right">
                <p className="mb-1 text-[9px] font-bold uppercase tracking-[.17em] text-[#aeb9af]">Intended studio</p>
                <p className="text-sm font-semibold text-[#f5edc9]">Vibe Atlas</p>
              </div>
            </div>
          </div>

          <div className="relative z-10 flex items-center justify-between px-2 pb-1 pt-3 text-[9px] font-bold uppercase tracking-[.16em] text-[#46524d]">
            <span>Member-authored · one-time exception</span>
            <span>VA–LM / 001</span>
          </div>
        </article>

        <section className="mt-5 rounded-2xl border border-[#c9c0aa] bg-[#f6f2e8]/75 p-4 shadow-[0_8px_24px_rgba(68,67,54,.06)] sm:p-5">
          <div className="flex gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#b85f4e]/10 text-[#b85f4e]"><Sparkles size={15} /></div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.17em] text-[#9c4e42]">Historical exception — saved by you</p>
              <p className="mt-1.5 max-w-[44ch] text-sm leading-6 text-[#46524d]">A rare system blooper, preserved as a collectible. It is not a reusable cross-universe mode.</p>
              <p className="mt-2 max-w-[48ch] border-l-2 border-[#d1b86d] pl-3 text-[11px] leading-5 text-[#69716b]"><strong className="font-bold text-[#4b5852]">Event-scoped record:</strong> Legendary Misprints can capture a cross-universe or same-universe filter/event anomaly. This stays in your saved collection only — it never feeds the normal Dylan Wang Star of the Day grid or Builder.</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setCollected((value) => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#1d2831] px-4 text-xs font-bold text-[#f7f0d0] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b85f4e]">
              {collected ? <Check size={14} /> : <Sparkles size={14} />}
              {collected ? "In your collection" : "Save to collection"}
            </button>
            <button type="button" onClick={exportArtifact} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#a9a38f] px-4 text-xs font-bold text-[#334047] transition-colors hover:bg-[#ebe5d6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b85f4e]"><Download size={14} /> Export artifact</button>
            <button type="button" onClick={() => void shareArtifact()} aria-label="Share artifact" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#a9a38f] px-3 text-xs font-bold text-[#334047] transition-colors hover:bg-[#ebe5d6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b85f4e]">{shared ? <Check size={14} /> : <Share2 size={14} />}</button>
          </div>
        </section>

        <button type="button" onClick={() => setShowProvenance((value) => !value)} className="mt-4 flex w-full items-center justify-between border-b border-[#c9c0aa] px-1 pb-3 text-left text-xs font-bold text-[#58625d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b85f4e]">
          <span className="flex items-center gap-2"><LockKeyhole size={14} /> Provenance & protected boundaries</span>
          <ChevronDown size={15} className={`transition-transform ${showProvenance ? "rotate-180" : ""}`} />
        </button>
        {showProvenance && (
          <div className="grid gap-3 border-b border-[#c9c0aa] px-1 py-4 text-xs leading-5 text-[#59645e] sm:grid-cols-2">
            <p><strong className="text-[#334047]">Captured:</strong> Vibe Atlas · saved 14 Feb 2025</p>
            <p><strong className="text-[#334047]">Record:</strong> Member-authored historical exception</p>
            <p className="sm:col-span-2"><strong className="text-[#334047]">Boundary:</strong> Ordinary Builder proposals and normal actor filters remain protected. Vibe Atlas and MemeForge are separate universes.</p>
          </div>
        )}
      </section>
    </main>
  );
}