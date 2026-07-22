import { useState, useEffect } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StarOfDayData {
  actorId: string;
  actorName: string;
  actorShortNameEn: string;
  actorAccentColor: string;
  vibeEmoji: string;
  vibeLabel: string;
  vibeLabelEn: string;
  vibeSubtitle: string;
  vibeSubtitleEn: string;
  date: string;
  stale?: boolean;
  building?: boolean;
}

interface Props {
  rawData: StarOfDayData;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PLAN_URL = "https://plan.justlikekatie.com/api/drafts";
const TOKEN    = import.meta.env.VITE_PLAN_SECRET ?? "";

const SERIES_OPTIONS  = ["A·Vibe", "B·Style", "C·Event", "D·BTS", "E·Fashion", "F·Interview", "G·Fan", "H·Cdrama"];
const PLATFORM_OPTIONS = ["Weibo", "Rednote", "WeChat", "Douyin"];

// ── Helper: check admin access ────────────────────────────────────────────────

function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    // Persist admin mode in sessionStorage so it survives client-side nav
    const fromUrl = new URLSearchParams(window.location.search).get("admin") === "true";
    if (fromUrl) sessionStorage.setItem("fandom_admin", "true");
    setIsAdmin(fromUrl || sessionStorage.getItem("fandom_admin") === "true");
  }, []);
  return isAdmin;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SendToPlanButton({ rawData }: Props) {
  const isAdmin = useIsAdmin();

  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error,   setError]   = useState("");

  // Form fields — pre-filled from the card data
  const defaultHeadline = `${rawData.vibeEmoji} ${rawData.vibeLabelEn} — ${rawData.actorShortNameEn}`;
  const defaultCaption  = rawData.vibeSubtitle;

  const [headline,      setHeadline]      = useState(defaultHeadline);
  const [caption,       setCaption]       = useState(defaultCaption);
  const [platform,      setPlatform]      = useState("Weibo");
  const [series,        setSeries]        = useState("A·Vibe");
  const [scheduledDate, setScheduledDate] = useState("");

  // Reset form each time modal opens with fresh card data
  function openModal() {
    setHeadline(defaultHeadline);
    setCaption(defaultCaption);
    setPlatform("Weibo");
    setSeries("A·Vibe");
    setScheduledDate("");
    setError("");
    setSuccess(false);
    setOpen(true);
  }

  async function handleSend() {
    if (!headline.trim()) { setError("Headline is required."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(PLAN_URL, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({
          headline:      headline.trim(),
          caption:       caption.trim(),
          platform,
          series,
          scheduledDate: scheduledDate || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      setSuccess(true);
      // Auto-close after 2 s
      setTimeout(() => { setSuccess(false); setOpen(false); }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — try again?");
    } finally {
      setLoading(false);
    }
  }

  // Only render for admin
  if (!isAdmin) return null;

  return (
    <>
      {/* ── Trigger button ──────────────────────────────────────────────── */}
      <button
        onClick={openModal}
        title="Send this card to plan.justlikekatie.com as a draft"
        style={{
          display:        "inline-flex",
          alignItems:     "center",
          gap:            "6px",
          padding:        "8px 14px",
          borderRadius:   "10px",
          border:         "1px solid rgba(255,255,255,0.25)",
          background:     "rgba(255,255,255,0.12)",
          color:          "#fff",
          fontSize:       "13px",
          fontWeight:     600,
          cursor:         "pointer",
          backdropFilter: "blur(6px)",
          transition:     "background 0.2s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.22)")}
        onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}
      >
        📋 Send to Plan
      </button>

      {/* ── Modal ───────────────────────────────────────────────────────── */}
      {open && (
        <div
          style={{
            position:       "fixed",
            inset:          0,
            background:     "rgba(0,0,0,0.65)",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            zIndex:         9999,
            padding:        "16px",
          }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            style={{
              background:   "#1a1f2e",
              borderRadius: "18px",
              padding:      "28px",
              width:        "100%",
              maxWidth:     "440px",
              display:      "flex",
              flexDirection:"column",
              gap:          "16px",
              boxShadow:    "0 24px 60px rgba(0,0,0,0.6)",
              color:        "#e2e8f0",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#fff" }}>
              📋 Send to Plan
            </h2>
            <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
              Creates a Draft in your Notion content calendar
            </p>

            {/* Headline */}
            <Field label="Headline">
              <input
                value={headline}
                onChange={e => setHeadline(e.target.value)}
                style={inputStyle}
              />
            </Field>

            {/* Caption / Weibo text */}
            <Field label="Weibo caption (Chinese)">
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </Field>

            {/* Platform + Series side by side */}
            <div style={{ display: "flex", gap: "12px" }}>
              <Field label="Platform" style={{ flex: 1 }}>
                <select
                  value={platform}
                  onChange={e => setPlatform(e.target.value)}
                  style={inputStyle}
                >
                  {PLATFORM_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>

              <Field label="Series" style={{ flex: 1 }}>
                <select
                  value={series}
                  onChange={e => setSeries(e.target.value)}
                  style={inputStyle}
                >
                  {SERIES_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>

            {/* Scheduled date */}
            <Field label="Scheduled date (optional)">
              <input
                type="date"
                value={scheduledDate}
                onChange={e => setScheduledDate(e.target.value)}
                style={inputStyle}
              />
            </Field>

            {/* Error / success */}
            {error   && <p style={{ color: "#f87171", fontSize: "13px", margin: 0 }}>⚠ {error}</p>}
            {success && <p style={{ color: "#4ade80", fontSize: "13px", fontWeight: 600, margin: 0 }}>✓ Added to Notion!</p>}

            {/* Buttons */}
            <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
              <button
                onClick={handleSend}
                disabled={loading || success}
                style={{
                  flex:          1,
                  padding:       "10px",
                  borderRadius:  "12px",
                  border:        "none",
                  background:    success ? "#22c55e" : "#3b82f6",
                  color:         "#fff",
                  fontWeight:    700,
                  fontSize:      "14px",
                  cursor:        loading || success ? "not-allowed" : "pointer",
                  opacity:       loading ? 0.7 : 1,
                  transition:    "background 0.2s",
                }}
              >
                {loading ? "Sending…" : success ? "✓ Sent!" : "Add to Plan"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  padding:      "10px 18px",
                  borderRadius: "12px",
                  border:       "1px solid #334155",
                  background:   "transparent",
                  color:        "#94a3b8",
                  cursor:       "pointer",
                  fontSize:     "14px",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Small layout helpers ──────────────────────────────────────────────────────

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", color: "#94a3b8", ...style }}>
      {label}
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  background:   "#0f172a",
  border:       "1px solid #334155",
  borderRadius: "8px",
  padding:      "8px 10px",
  color:        "#e2e8f0",
  fontSize:     "13px",
  outline:      "none",
  width:        "100%",
  boxSizing:    "border-box",
};

export default SendToPlanButton;
