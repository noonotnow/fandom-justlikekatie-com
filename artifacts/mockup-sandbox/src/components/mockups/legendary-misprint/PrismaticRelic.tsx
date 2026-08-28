import { useState } from "react";
import { Archive, ArrowDown, Check, Copy, Eye, LockKeyhole, Sparkles } from "lucide-react";

const IMAGE = "/__mockup/images/mixed-grid.png";

export function PrismaticRelic() {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  function copyRecord() {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="relic-shell">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&display=swap');
        :root { color-scheme: dark; }
        * { box-sizing: border-box; }
        body { margin: 0; background: #090a0e; }
        .relic-shell {
          min-height: 100vh; overflow: hidden; position: relative; color: #eeeae3;
          background: radial-gradient(circle at 78% 15%, rgba(56, 39, 83, .28), transparent 30%), #090a0e;
          font-family: Manrope, sans-serif; padding: 28px 22px 42px;
        }
        .relic-shell:before {
          content: ""; position: fixed; inset: 0; pointer-events: none; opacity: .18;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 140 140' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.18'/%3E%3C/svg%3E");
          mix-blend-mode: screen;
        }
        .relic-wrap { max-width: 960px; margin: auto; position: relative; }
        .eyebrow { display:flex; align-items:center; justify-content:space-between; gap: 14px; color:#8d8b98; font: 500 10px/1.4 'DM Mono', monospace; letter-spacing:.14em; text-transform:uppercase; }
        .eyebrow span:first-child { color:#cfab6b; }
        .topline { height:1px; margin:16px 0 24px; background:linear-gradient(90deg,#cfab6b,rgba(207,171,107,.14),transparent); }
        .artifact { position:relative; border:1px solid rgba(221,190,133,.34); border-radius:20px; padding:10px; background:linear-gradient(135deg, rgba(255,255,255,.08), rgba(114,81,151,.12) 40%, rgba(24,24,31,.72)); box-shadow: 0 28px 80px rgba(0,0,0,.48), inset 0 0 0 1px rgba(255,255,255,.04); }
        .artifact:after { content:""; pointer-events:none; position:absolute; inset:0; border-radius:20px; opacity:.5; background:linear-gradient(112deg,transparent 14%,rgba(107,221,238,.13) 31%,transparent 42%,rgba(229,139,202,.11) 68%,transparent 77%); animation: sheen 11s ease-in-out infinite; }
        .artifact-inner { position:relative; z-index:1; overflow:hidden; border-radius:13px; background:#12131a; }
        .relic-head { display:flex; align-items:flex-start; justify-content:space-between; padding:22px 22px 18px; gap:18px; }
        .mark { width:38px; height:38px; display:grid; place-items:center; border:1px solid rgba(207,171,107,.48); border-radius:10px; color:#e3bd7b; background:rgba(207,171,107,.08); }
        h1 { margin:13px 0 5px; font-size:clamp(25px,4vw,39px); letter-spacing:-.055em; line-height:1.03; font-weight:700; }
        .subhead { color:#a7a4ad; font-size:12px; margin:0; line-height:1.5; }
        .seal { border:1px solid rgba(207,171,107,.48); color:#e0bd79; border-radius:99px; padding:7px 10px; white-space:nowrap; font:500 9px 'DM Mono',monospace; letter-spacing:.08em; text-transform:uppercase; }
        .image-stage { position:relative; aspect-ratio: 16/8.8; background:#090b10; overflow:hidden; }
        .image-stage:before { content:""; position:absolute; z-index:1; inset:0; background:linear-gradient(90deg, rgba(8,8,13,.58), transparent 44%, rgba(30,19,50,.2)), linear-gradient(0deg, rgba(8,8,13,.55), transparent 40%); pointer-events:none; }
        .image-stage img { width:100%; height:100%; display:block; object-fit:cover; filter:saturate(.7) contrast(1.08); transform:scale(1.01); }
        .image-caption { position:absolute; z-index:2; left:20px; bottom:18px; font:10px 'DM Mono',monospace; color:#c9c4c5; letter-spacing:.05em; text-transform:uppercase; }
        .misprint-seal { position:absolute; z-index:2; right:22px; top:18px; width:76px; height:76px; display:grid; place-items:center; color:#d6a9ed; opacity:.92; transform:rotate(-8deg); }
        .misprint-seal:before, .misprint-seal:after { content:""; position:absolute; border-radius:50%; }
        .misprint-seal:before { inset:0; border:1px solid rgba(207,163,237,.78); box-shadow:inset 0 0 0 4px rgba(167,105,206,.12), 0 0 0 1px rgba(93,151,197,.38); background:conic-gradient(from 30deg, rgba(214,169,237,.18), transparent 23%, rgba(117,211,218,.3) 42%, transparent 61%, rgba(222,157,219,.25) 80%, transparent); }
        .misprint-seal:after { inset:9px; border:1px dashed rgba(222,190,242,.68); }
        .seal-core { position:relative; z-index:1; width:28px; height:28px; display:grid; place-items:center; border:1px solid rgba(240,214,249,.76); background:rgba(71,36,93,.72); clip-path:polygon(50% 0, 100% 24%, 82% 100%, 18% 100%, 0 24%); }
        .seal-core:before { content:""; width:10px; height:10px; border:1px solid #e5c6ef; transform:rotate(45deg); box-shadow:4px -4px 0 -3px #7dd2d0; }
        .seal-code { position:absolute; bottom:-15px; color:#d8b0eb; font:8px 'DM Mono',monospace; letter-spacing:.14em; white-space:nowrap; }
        .metadata { display:grid; grid-template-columns:1.3fr 1fr 1fr; border-top:1px solid rgba(255,255,255,.07); border-bottom:1px solid rgba(255,255,255,.07); }
        .meta { padding:16px 18px; border-right:1px solid rgba(255,255,255,.07); min-height:68px; }
        .meta:last-child { border-right:0; }.label { display:block; color:#777580; font:9px 'DM Mono',monospace; letter-spacing:.11em; text-transform:uppercase; margin-bottom:7px; }.value { color:#e7e1d7; font-size:12px; font-weight:700; }.value.gold { color:#dfb970; }
        .body { padding:21px 22px 23px; display:grid; grid-template-columns:1fr 1.08fr; gap:27px; }
        .provenance { border-left:2px solid #c49a57; padding-left:14px; }.provenance h2, .origin h2 { margin:0 0 9px; font-size:12px; text-transform:uppercase; letter-spacing:.1em; color:#e3dbcc; }.provenance p { margin:0; color:#aaa7ab; font-size:12px; line-height:1.7; }.provenance strong { color:#e4ded4; font-weight:700; }
        .origin { border:1px solid rgba(255,255,255,.09); padding:14px; border-radius:11px; background:rgba(255,255,255,.025); }.trail { display:flex; gap:10px; align-items:flex-start; margin-top:12px; }.trail-dot { flex:none; width:7px;height:7px;border-radius:50%;margin-top:4px;background:#cfab6b;box-shadow:0 0 0 4px rgba(207,171,107,.1)}.trail p { margin:0;color:#94919a;font-size:11px;line-height:1.5; }.trail b { color:#d8d1c9; font-weight:600; }
        .guardrails { margin:0 22px 20px; padding:14px; display:flex; align-items:center; gap:12px; border:1px solid rgba(116,154,143,.28); border-radius:11px; background:rgba(69,112,101,.08); color:#b8ccc4; font-size:11px; line-height:1.5; }.guardrails svg { flex:none; color:#89b5a6; }.guardrails b { color:#d5e2dd; }
        .actions { display:flex; gap:10px; padding:0 22px 22px; }.actions button { border:1px solid rgba(218,188,133,.38); color:#d9c092; background:rgba(207,171,107,.08); border-radius:8px; min-height:36px; padding:0 12px; font:600 10px 'DM Mono',monospace; letter-spacing:.06em; text-transform:uppercase; cursor:pointer; transition:background .2s, border-color .2s; }.actions button:hover { background:rgba(207,171,107,.16); border-color:#cfab6b; }.actions button.secondary { color:#aaa7ad; border-color:rgba(255,255,255,.12); background:transparent; }.actions button:focus-visible { outline:2px solid #e3bd7b; outline-offset:3px; }
        .note { display:flex; justify-content:space-between; gap:12px; align-items:center; margin-top:16px; color:#787681; font:10px 'DM Mono',monospace; }.note button { border:0; background:none; color:#9d9aa4; font:inherit; text-decoration:underline; cursor:pointer; text-underline-offset:3px; }
        .revealed { margin-top:12px; padding:11px 13px; color:#aca8b0; border-top:1px solid rgba(255,255,255,.08); font-size:11px; line-height:1.55; }
        @keyframes sheen { 0%,75%,100% { transform:translateX(-8%); opacity:.3; } 88% { transform:translateX(8%); opacity:.7; } }
        @media (prefers-reduced-motion:reduce) { .artifact:after { animation:none; } * { scroll-behavior:auto!important; transition:none!important; } }
        @media (max-width:650px) { .relic-shell { padding:18px 12px 30px; }.relic-head { padding:18px 15px 15px; }.seal { font-size:8px; }.metadata { grid-template-columns:1fr; }.meta { border-right:0; border-bottom:1px solid rgba(255,255,255,.07); padding:12px 15px; min-height:auto; }.meta:last-child{border-bottom:0}.body { grid-template-columns:1fr; padding:17px 15px 18px; gap:18px; }.guardrails,.actions { margin-left:15px;margin-right:15px; }.actions { padding-left:0;padding-right:0; flex-wrap:wrap; }.image-stage { aspect-ratio: 1.28; } }
      `}</style>
      <div className="relic-wrap">
        <div className="eyebrow"><span>Fandom Vibes · Archive / 07</span><span>Object status: preserved</span></div>
        <div className="topline" />
        <section className="artifact" aria-label="Legendary Misprint relic">
          <div className="artifact-inner">
            <header className="relic-head">
              <div><div className="mark"><Sparkles size={18} /></div><h1>Vibe Atlas × Gandalf</h1><p className="subhead">A singular system blooper, kept exactly as found.</p></div>
              <div className="seal">Legendary Misprint</div>
            </header>
            <div className="image-stage">
              <img src={IMAGE} alt="Saved mixed grid showing the anomalous Vibe Atlas and Gandalf collision" />
              <div className="misprint-seal" aria-label="Prismatic Misprint Seal" role="img"><div className="seal-core" /><span className="seal-code">M·01 / SAVED</span></div>
              <div className="image-caption">Mixed grid · canonical saved image · 09 fragments</div>
            </div>
            <div className="metadata">
              <div className="meta"><span className="label">Intended studio</span><span className="value gold">Vibe Atlas</span></div>
              <div className="meta"><span className="label">Unexpected identity</span><span className="value">Gandalf</span></div>
              <div className="meta"><span className="label">Captured</span><span className="value">14 February 2024</span></div>
            </div>
            <div className="body">
              <div className="provenance"><h2>Provenance, not taxonomy</h2><p><strong>A single saved event anomaly.</strong> This one crossed universes: C-drama intent and Middle-earth imagery collided once. A Legendary Misprint can also stay inside one universe, like the Dylan Wangtermelon event. Either way, the member preserves the exception as history — never as a new mode.</p><div className="note"><span>RELIC ID · VA-GND-001</span><button type="button" onClick={copyRecord}>{copied ? "Copied" : "Copy record"} {copied ? <Check size={10} style={{verticalAlign:"-2px"}} /> : <Copy size={10} style={{verticalAlign:"-2px"}} />}</button></div></div>
              <div className="origin"><h2>How this event became a relic</h2><div className="trail"><span className="trail-dot" /><p><b>Intent entered</b><br />Vibe Atlas · C-drama visual direction</p></div><div className="trail"><span className="trail-dot" /><p><b>One render anomalized</b><br />Gandalf appeared where the intended actor should have remained</p></div><div className="trail"><span className="trail-dot" /><p><b>Member intervention</b><br />Saved as a Legendary Misprint before correction</p></div></div>
            </div>
            <div className="guardrails"><LockKeyhole size={17} /><span><b>Boundary retained.</b> The anomaly is visible only in saved artifacts and its dedicated Legendary Misprint filter — never in the normal Dylan Wang Star of the Day grid or the ordinary Builder pool.</span></div>
            <div className="actions"><button type="button" onClick={() => setRevealed(v => !v)}><Eye size={13} style={{verticalAlign:"-2px",marginRight:6}} />{revealed ? "Hide archive note" : "Reveal archive note"}</button><button type="button" className="secondary" onClick={copyRecord}><Archive size={13} style={{verticalAlign:"-2px",marginRight:6}} />{copied ? "Record copied" : "Preserve record"}</button></div>
            {revealed && <div className="revealed">The anomaly is memorable because it remains legible as an error: two source identities, one timestamp, no new category. Its historical value is the boundary it documents.</div>}
          </div>
        </section>
        <div className="note"><span>ARCHIVAL DISPLAY · MEMBER-AUTHORED · SINGLE SAVED EVENT</span><span><ArrowDown size={12} style={{verticalAlign:"-2px"}} /> scroll for context</span></div>
      </div>
    </main>
  );
}