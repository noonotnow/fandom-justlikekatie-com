const CONTENT_ID = "lg01-v1";
const BATCH_KEY = "c-drama-fandom-lg01";
const CANONICAL_URL = "https://fandom.justlikekatie.com/c-drama-fandom/fandom-games/";

const outcomes = [
  {
    id: "moonlit-strategist",
    number: "01",
    name: "Moonlit Strategist",
    cn: "月下谋士",
    color: "#7197c1",
    description: "You read the room before anyone else notices there is a room to read. Your fate is quiet leverage, patient timing, and a plan that looks effortless only after it works.",
  },
  {
    id: "exiled-immortal",
    number: "02",
    name: "Exiled Immortal",
    cn: "谪仙",
    color: "#d9dde2",
    description: "You carry otherworldly standards into very human situations. Your fate is to belong everywhere and nowhere—until you decide that choosing a place is its own kind of ascension.",
  },
  {
    id: "chaos-prince",
    number: "03",
    name: "Chaos Prince",
    cn: "混世公子",
    color: "#c93a4e",
    description: "Rules become suggestions when you enter the story. Your fate is mischief with conviction: the trouble is real, but so is the strange new path you open through it.",
  },
  {
    id: "lotus-healer",
    number: "04",
    name: "Lotus Healer",
    cn: "莲心医者",
    color: "#e1a4bd",
    description: "Tenderness is not the opposite of strength in your hands. Your fate is restoration without self-erasure—and learning that the healer is allowed to be held, too.",
  },
  {
    id: "silent-sword",
    number: "05",
    name: "Silent Sword",
    cn: "无言剑客",
    color: "#96a4b2",
    description: "You do not waste declarations on choices already made. Your fate is precision, loyalty, and one decisive action after everyone else has finished explaining.",
  },
  {
    id: "fox-spirit",
    number: "06",
    name: "Fox Spirit",
    cn: "狐灵",
    color: "#e5a51f",
    description: "People underestimate playfulness at their peril. Your fate is charm with a hidden map: half warmth, half riddle, and always one escape route more than anyone expected.",
  },
  {
    id: "celestial-guardian",
    number: "07",
    name: "Celestial Guardian",
    cn: "天界守将",
    color: "#d5ac58",
    description: "Duty finds you because you keep answering. Your fate is protection with a cost—and the revelation that guarding everyone else does not require abandoning yourself.",
  },
  {
    id: "bamboo-recluse",
    number: "08",
    name: "Bamboo Recluse",
    cn: "竹林隐士",
    color: "#75af91",
    description: "You step outside the noise to hear the actual question. Your fate is cultivated distance, clear sight, and the inconvenient truth that the world still seeks your counsel.",
  },
  {
    id: "fated-romantic",
    number: "09",
    name: "Fated Romantic",
    cn: "情劫中人",
    color: "#e1a4bd",
    description: "You would recognize the promise in any lifetime. Your fate is not naïveté but brave recurrence: choosing meaning again, even when you know exactly what it can cost.",
  },
];

const byId = new Map(outcomes.map((outcome) => [outcome.id, outcome]));
const choices = document.querySelectorAll("[data-fate]");
const result = document.querySelector("#fate-result");
const shareButton = document.querySelector("#share-fate");
const copyButton = document.querySelector("#copy-fate");
const downloadButton = document.querySelector("#download-fate");
const status = document.querySelector("#share-status");
let selected = null;

function track(event, outcomeId, source) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event,
    fandom_content_id: CONTENT_ID,
    fandom_outcome_id: outcomeId || undefined,
    fandom_source: source || undefined,
  });

  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".replit.dev")) return;

  fetch("/.netlify/functions/log-engagement", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      event,
      batchKey: BATCH_KEY,
      contentId: CONTENT_ID,
      ...(outcomeId ? { outcomeId } : {}),
      ...(source ? { source } : {}),
    }),
  }).catch(() => {});
}

function shareUrl(outcome) {
  const url = new URL(CANONICAL_URL);
  url.searchParams.set("fate", outcome.id);
  url.searchParams.set("utm_source", "fandom_share");
  url.searchParams.set("utm_medium", "organic");
  url.searchParams.set("utm_campaign", "lg01");
  return url.toString();
}

function announce(message) {
  status.textContent = message;
}

function renderOutcome(outcome, options = {}) {
  selected = outcome;
  result.hidden = false;
  result.style.setProperty("--result-color", outcome.color);
  result.querySelector(".fate-result__index").textContent = "LG · 01 / FATE " + outcome.number;
  result.querySelector("h3").textContent = outcome.name;
  result.querySelector(".fate-result__cn").textContent = outcome.cn;
  result.querySelector(".fate-result__description").textContent = outcome.description;
  choices.forEach((choice) => {
    choice.setAttribute("aria-pressed", String(choice.dataset.fate === outcome.id));
  });
  shareButton.disabled = false;
  copyButton.disabled = false;
  downloadButton.disabled = false;

  if (options.updateUrl !== false) {
    const localUrl = new URL(window.location.href);
    localUrl.search = "";
    localUrl.searchParams.set("fate", outcome.id);
    window.history.replaceState({}, "", localUrl);
  }
  if (options.track !== false) {
    track("fandom_game_reveal", outcome.id, options.source || "direct");
  }
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  result.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
}

choices.forEach((choice) => {
  const outcome = byId.get(choice.dataset.fate);
  if (!outcome) return;
  choice.style.setProperty("--fate-color", outcome.color);
  choice.addEventListener("click", () => renderOutcome(outcome));
});

async function copyLink(outcome) {
  const url = shareUrl(outcome);
  try {
    await navigator.clipboard.writeText(url);
    announce("Your privacy-safe fate link is copied.");
  } catch {
    const input = document.createElement("textarea");
    input.value = url;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
    announce("Your fate link is copied.");
  }
}

shareButton.addEventListener("click", async () => {
  if (!selected) return;
  const payload = {
    title: "Which Xianxia Fate Chose You?",
    text: "My xianxia fate is " + selected.name + ". Which one exposes you?",
    url: shareUrl(selected),
  };
  try {
    if (navigator.share) {
      await navigator.share(payload);
      announce("Your fate is out in the world.");
    } else {
      await copyLink(selected);
    }
    track("fandom_game_share", selected.id, "direct");
  } catch (error) {
    if (error && error.name !== "AbortError") announce("Sharing paused. You can still copy the link.");
  }
});

copyButton.addEventListener("click", async () => {
  if (!selected) return;
  await copyLink(selected);
  track("fandom_game_share", selected.id, "direct");
});

function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? line + " " + word : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines;
}

downloadButton.addEventListener("click", () => {
  if (!selected) return;
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(800, 140, 20, 620, 540, 1000);
  gradient.addColorStop(0, "#17344d");
  gradient.addColorStop(1, "#061321");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = selected.color;
  ctx.lineWidth = 4;
  ctx.strokeRect(74, 74, 932, 1202);

  ctx.fillStyle = selected.color;
  ctx.font = "700 30px monospace";
  ctx.fillText("LG · 01 / FATE " + selected.number, 112, 148);
  ctx.fillStyle = "#f3eee5";
  ctx.font = "52px Georgia, serif";
  ctx.fillText("WHICH XIANXIA FATE CHOSE YOU?", 112, 258);
  ctx.font = "500 100px Georgia, serif";
  const nameLines = wrapText(ctx, selected.name.toUpperCase(), 820);
  nameLines.forEach((line, index) => ctx.fillText(line, 112, 470 + index * 112));
  const copyY = 520 + nameLines.length * 112;
  ctx.fillStyle = selected.color;
  ctx.font = "52px Georgia, serif";
  ctx.fillText(selected.cn, 112, copyY);
  ctx.fillStyle = "#c6d1d7";
  ctx.font = "36px system-ui, sans-serif";
  const descriptionLines = wrapText(ctx, selected.description, 830);
  descriptionLines.slice(0, 6).forEach((line, index) => ctx.fillText(line, 112, copyY + 100 + index * 54));
  ctx.fillStyle = "#d5ac58";
  ctx.font = "700 25px monospace";
  ctx.fillText("FANDOM VIBES · FANDOM.JUSTLIKEKATIE.COM", 112, 1188);
  ctx.fillStyle = "#91a4b0";
  ctx.font = "24px system-ui, sans-serif";
  ctx.fillText("Don't pick your favorite. Pick the one that exposes you.", 112, 1235);

  const link = document.createElement("a");
  link.download = "fandom-vibes-lg01-" + selected.id + ".png";
  link.href = canvas.toDataURL("image/png");
  link.click();
  announce("Your fate card is downloaded.");
  track("fandom_game_share", selected.id, "direct");
});

const incomingId = new URLSearchParams(window.location.search).get("fate");
const incomingOutcome = incomingId ? byId.get(incomingId) : null;
track("fandom_game_start", incomingOutcome?.id, incomingOutcome ? "share" : "direct");
if (incomingOutcome) {
  renderOutcome(incomingOutcome, { updateUrl: false, track: false, source: "share" });
  track("fandom_share_open", incomingOutcome.id, "share");
}