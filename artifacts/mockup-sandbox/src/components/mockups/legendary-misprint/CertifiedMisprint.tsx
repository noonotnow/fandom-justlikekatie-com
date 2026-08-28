import { useState, type ReactNode } from "react";

const imageUrl = "/__mockup/images/mixed-grid.png";

function Label({ children }: { children: ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#756f67]">
      {children}
    </span>
  );
}

function Fact({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: string;
  detail?: string;
  accent?: boolean;
}) {
  return (
    <div className="border-t border-[#d8d1c6] py-4 first:border-t-0">
      <Label>{label}</Label>
      <div className={`mt-1 text-[15px] font-semibold tracking-[-0.01em] ${accent ? "text-[#994c32]" : "text-[#25231f]"}`}>
        {value}
      </div>
      {detail && <p className="mt-1 text-xs leading-5 text-[#777068]">{detail}</p>}
    </div>
  );
}

export function CertifiedMisprint() {
  const [showRecord, setShowRecord] = useState(false);
  const [scope, setScope] = useState<"cross-universe" | "same-universe">("cross-universe");
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");

  const copyRecord = async () => {
    try {
      await navigator.clipboard?.writeText("FVA-LM-2024-0917 · Legendary Misprint · Gandalf");
      setCopied(true);
      setNotice("Archive reference copied");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice("Archive reference: FVA-LM-2024-0917");
    }
  };

  return (
    <main className="min-h-[100dvh] bg-[#e9e3d9] px-4 py-5 text-[#25231f] sm:px-8 sm:py-10">
      <div className="mx-auto max-w-[1120px]">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-5 border-b border-[#cfc6b9] pb-5">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[#994c32]">
              <span aria-hidden="true" className="text-sm">◈</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.22em]">Fandom Vibes · Archive desk</span>
            </div>
            <h1 className="font-['Instrument_Serif'] text-4xl leading-[0.95] tracking-[-0.035em] text-[#25231f] sm:text-6xl">
              Certified Misprint
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#6f6961]">
              A one-time historical system blooper, preserved as evidence — not opened as a new way to build.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="border border-[#cfc6b9] bg-[#f2eee8] px-3 py-2 text-right">
              <Label>Archive ref.</Label>
              <div className="mt-1 font-mono text-xs font-bold tracking-[0.1em]">FVA-LM-2024-0917</div>
            </div>
            <button
              type="button"
              onClick={copyRecord}
              className="flex h-10 w-10 items-center justify-center border border-[#bdb3a6] bg-[#f2eee8] text-[#635d55] transition hover:bg-[#e6dfd5] focus:outline-none focus:ring-2 focus:ring-[#994c32] focus:ring-offset-2 focus:ring-offset-[#e9e3d9]"
              aria-label="Copy archive reference"
            >
              {copied ? <span className="text-sm text-[#39705a]">✓</span> : <span className="text-sm">⧉</span>}
            </button>
          </div>
        </header>

        <section className="grid overflow-hidden border border-[#c8beb0] bg-[#f5f1eb] shadow-[0_18px_45px_rgba(60,47,34,0.12)] lg:grid-cols-[1.06fr_0.94fr]">
          <div className="relative min-h-[390px] overflow-hidden bg-[#373b3b] p-5 sm:p-8">
            <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(115deg,transparent_18%,rgba(226,206,148,.8)_38%,transparent_48%,rgba(159,200,196,.5)_64%,transparent_76%)] [background-size:220%_220%] motion-safe:animate-[foil_9s_ease-in-out_infinite]" />
            <div className="relative flex h-full min-h-[355px] flex-col justify-between">
              <div className="flex items-start justify-between">
                <div className="border border-[#e7d6a0]/50 bg-[#252a2a]/75 px-3 py-2 backdrop-blur-sm">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#ead9a6]">Saved artifact</div>
                  <div className="mt-1 text-xs text-[#d6d0c3]">Historical exception · sealed</div>
                </div>
                <div role="img" aria-label="Vibe Atlas purple archive mark" className="relative flex h-14 w-14 rotate-6 items-center justify-center border border-[#b99be8]/80 bg-[#7250a1]/35 text-center shadow-[inset_0_0_0_3px_rgba(185,155,232,.14)]">
                  <span aria-hidden="true" className="text-lg font-semibold text-[#e2d2ff]">V</span>
                  <span aria-hidden="true" className="absolute -right-1 -top-1 h-3 w-3 border border-[#d8c3ff] bg-[#9a72d1]" />
                </div>
              </div>
              <div className="mx-auto w-full max-w-[470px] border border-[#cfc3a5]/50 bg-[#171b1b] p-2 shadow-2xl">
                <div className="relative aspect-[4/3] overflow-hidden bg-[#252a2a]">
                  <img src={imageUrl} alt="Mixed grid captured during the historical system blooper" className="h-full w-full object-cover opacity-90" />
                  <div className="absolute inset-0 border-[10px] border-[#171b1b]/20" />
                  <div className="absolute bottom-3 left-3 border border-[#ead9a6]/60 bg-[#171b1b]/80 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[#f0e6c7]">
                    Captured state · mixed grid
                  </div>
                  <div role="img" aria-label="Legendary Misprint Seal: authenticates this historical artifact; scope is collection-only" className="absolute bottom-3 right-3 flex h-16 w-16 rotate-[-9deg] items-center justify-center rounded-full border border-[#e3cc8d] bg-[#b89954]/20 text-center shadow-[inset_0_0_0_3px_rgba(227,204,141,.14)] backdrop-blur-[1px]">
                    <span aria-hidden="true" className="relative font-mono text-[8px] font-bold leading-3 tracking-[0.08em] text-[#f0e6c7]">
                      MISPRINT
                      <span className="absolute -left-1 top-1 h-2 w-5 border-y border-[#d9bf79] opacity-80" />
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-end justify-between text-[#d6d0c3]">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[#b9b1a3]">Unexpected identity</div>
                  <div className="mt-1 font-['Instrument_Serif'] text-3xl text-[#f0e6c7]">Gandalf</div>
                </div>
                <div className="font-mono text-[10px] tracking-[0.14em] text-[#b9b1a3]">PLATE 01 / 01</div>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-9">
            <div className="mb-7 flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e6eee8] text-[#39705a]">
                <span aria-hidden="true" className="text-lg">✓</span>
              </div>
              <div>
                <Label>Certificate of provenance</Label>
                <h2 className="mt-1 font-['Instrument_Serif'] text-3xl leading-none text-[#25231f]">The record is the safeguard.</h2>
                <p className="mt-2 text-xs leading-5 text-[#716a62]">Classification was cleaned after capture. The image and its unexpected identity remain unchanged.</p>
              </div>
            </div>
            <div className="grid gap-x-8 sm:grid-cols-2">
              <Fact label="Captured state" value="Mixed grid" detail="The image is preserved exactly as encountered." />
              <Fact label="Saved classification" value="Legendary Misprint" accent detail="An archive label, not a reusable product mode." />
              <Fact label="Intended studio" value="Vibe Atlas" detail="The originating universe remains the source of record." />
              <Fact label="Unexpected identity" value="Gandalf" detail="Retained as provenance; not promoted to an ordinary filter." />
            </div>
            <div className="mt-2 flex items-center gap-2 border-t border-[#d8d1c6] pt-5 text-xs font-semibold text-[#39705a]">
              <span aria-hidden="true" className="text-sm">▣</span>
              <span>Builder status: excluded</span>
            </div>
            <p className="mt-2 pl-6 text-xs leading-5 text-[#777068]">Ordinary Builder proposals and normal actor filters remain protected from this record.</p>
            <div className="mt-5 border-t border-[#d8d1c6] pt-4">
              <Label>Seal scope</Label>
              <p className="mt-1 text-xs leading-5 text-[#716a62]">Authenticates a preserved event record only. It does not authorize a new cross-universe mode or alter ordinary discovery.</p>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 md:grid-cols-[1fr_1.35fr]">
          <div className="border border-[#c8beb0] bg-[#f5f1eb] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="mt-0.5 shrink-0 text-sm text-[#994c32]">!</span>
              <div>
                <Label>Boundary note</Label>
                <p className="mt-2 text-sm leading-6 text-[#4d4943]">Vibe Atlas and MemeForge are separate universes. This member-authored exception does not bridge them.</p>
              </div>
            </div>
          </div>
          <div className="border border-[#c8beb0] bg-[#f5f1eb] p-5 sm:p-6">
            <button type="button" onClick={() => setShowRecord(!showRecord)} className="flex w-full items-center justify-between text-left focus:outline-none focus:ring-2 focus:ring-[#994c32] focus:ring-offset-2 focus:ring-offset-[#f5f1eb]">
              <span><Label>Audit trail</Label><span className="mt-2 block text-sm font-semibold">How this exception is handled</span></span>
              <span aria-hidden="true" className={`text-sm text-[#756f67] transition-transform ${showRecord ? "rotate-180" : ""}`}>⌄</span>
            </button>
            {showRecord && (
              <div className="mt-4 border-t border-[#d8d1c6] pt-4">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setScope("cross-universe")} className={`border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] ${scope === "cross-universe" ? "border-[#994c32] bg-[#994c32] text-[#f9f5ee]" : "border-[#cfc6b9] text-[#756f67]"}`}>
                    Cross-universe collision
                  </button>
                  <button type="button" onClick={() => setScope("same-universe")} className={`border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] ${scope === "same-universe" ? "border-[#39705a] bg-[#39705a] text-[#f5f1eb]" : "border-[#cfc6b9] text-[#756f67]"}`}>
                    Same-universe anomaly
                  </button>
                </div>
                <div className="mt-4 border-l-2 border-[#d2b66d] pl-3 text-xs leading-5 text-[#716a62]">
                  {scope === "cross-universe" ? (
                    <>
                      <strong className="font-semibold text-[#4d4943]">Gandalf · cross-universe collision.</strong>{" "}
                      The captured identity crossed into a Vibe Atlas grid. Preserve the image and provenance, but keep it out of ordinary actor filters and Builder proposals.
                    </>
                  ) : (
                    <>
                      <strong className="font-semibold text-[#4d4943]">Dylan Wangtermelon event · same-universe filter/event anomaly.</strong>{" "}
                      Collection-only reference; excluded from the normal Dylan Wang Star of the Day grid and Builder proposals.
                    </>
                  )}
                </div>
                <p className="mt-3 text-[11px] leading-5 text-[#8a8178]">Both scopes are historical records, not reusable modes. The originating universe and normal discovery surfaces stay authoritative.</p>
              </div>
            )}
          </div>
        </section>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-4 text-[11px] text-[#7b746b]">
          <span>Preservation record · no new cross-fandom mode created</span>
          <button type="button" onClick={() => { setNotice("Record is already sealed"); }} className="inline-flex items-center gap-1.5 font-semibold text-[#994c32] hover:underline">
            View collection record <span aria-hidden="true" className="text-xs">↗</span>
          </button>
        </footer>
        {notice && <div role="status" className="fixed bottom-5 left-1/2 -translate-x-1/2 border border-[#b8cdbd] bg-[#edf4ee] px-4 py-2 text-xs font-semibold text-[#39705a] shadow-lg">{notice}</div>}
      </div>
      <style>{`@keyframes foil{0%,100%{background-position:0% 50%;opacity:.18}50%{background-position:100% 50%;opacity:.36}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important}}`}</style>
    </main>
  );
}

export default CertifiedMisprint;