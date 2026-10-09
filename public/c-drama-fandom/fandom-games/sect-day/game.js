import { GAME_ID, GAME_URL, SCENES, sceneAt, resolveRun, incomingEnding } from "./story.js";
import { drawCard } from "./card.js";
const view = document.querySelector("#story-view");
const controls = document.querySelector("#controls");
const progress = document.querySelector("#progress");
const status = document.querySelector("#action-status");
let trail = [], phase = "intro", selected = null, generation = 0;
const source = incomingEnding(location.search) ? "share" : "direct";
function track(event, outcomeId, method) {
  const payload = { event, batchKey: "c-drama-fandom-sect-day", contentId: GAME_ID, source, ...(outcomeId ? { outcomeId } : {}), ...(method ? { shareMethod: method } : {}) };
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ ...payload });
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname.endsWith(".replit.dev")) return;
    fetch("/.netlify/functions/log-engagement", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", keepalive: true, body: JSON.stringify(payload) }).catch(() => {});
  } catch { /* Telemetry is never part of story control flow. */ }
}
function node(tag, text, className) {
  const el = document.createElement(tag); el.textContent = text;
  if (className) el.className = className;
  return el;
}
function heading(text, focus = true) {
  const el = node("h2", text, "sect-heading"); el.id = "sect-heading"; el.tabIndex = -1;
  view.append(el); if (focus) el.focus();
}
function button(text, action, className = "button") {
  const el = node("button", text, className); el.type = "button"; el.addEventListener("click", action); return el;
}
function clear() { view.classList.remove("sect-intro"); view.replaceChildren(); controls.replaceChildren(); status.textContent = ""; }
function start() {
  if (phase === "choice" || phase === "consequence") return;
  generation++; trail = []; selected = null; phase = "choice";
  history.replaceState({}, "", location.pathname);
  track("sect_game_start"); renderScene();
}
function renderScene() {
  clear(); const index = trail.length, token = generation;
  const scene = sceneAt(index, trail);
  progress.textContent = `Decision ${index + 1} of 5`;
  heading(scene.title);
  view.append(node("p", scene.text));
  scene.callbacks.forEach(text => view.append(node("p", text, "sect-callback")));
  const list = node("ol", "", "sect-choices");
  scene.choices.forEach((choice, value) => {
    const item = document.createElement("li");
    item.append(button(choice.label, () => {
    if (phase !== "choice" || generation !== token || trail.length !== index) return;
    phase = "consequence"; trail.push(value);
    list.querySelectorAll("button").forEach(el => { el.disabled = true; });
    const feedback = node("div", "", "sect-consequence");
    const title = node("h3", "Your choice"); title.tabIndex = -1;
    feedback.append(title, node("p", choice.consequence)); view.append(feedback);
    controls.append(button(index === 4 ? "See your ending" : "Continue", () => {
      if (phase !== "consequence" || generation !== token || trail.length !== index + 1) return;
      phase = index === 4 ? "result" : "choice";
      if (phase === "result") { selected = resolveRun(trail); track("sect_game_complete", selected.id); renderResult(false); }
      else renderScene();
    }));
    title.focus();
  }, "sect-choice"));
    list.append(item);
  });
  view.append(list);
}
function publicLink() { return GAME_URL + "?ending=" + selected.id; }
async function copy(id, token) {
  const url = GAME_URL + "?ending=" + id;
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(url);
  } catch {
    const input = node("textarea", url); input.value = url; input.readOnly = true;
    input.style.position = "fixed"; input.style.opacity = "0"; document.body.append(input);
    const focused = document.activeElement;
    try { input.select(); if (!document.execCommand("copy")) throw new Error("Copy rejected"); }
    finally { input.remove(); focused?.focus(); }
  }
  track("sect_game_action", id, "copy");
  if (token === generation) status.textContent = "Ending link copied. No decisions included.";
}
function resultActions(shared) {
  controls.append(button(shared ? "Play your own first day" : "Play again", start));
  let busy = false;
  function action(label, fn) {
    const el = button(label, async () => {
      if (busy || !selected) return;
      busy = true; const token = generation, id = selected.id;
      try { await fn(id, token); }
      catch (error) { if (token === generation) status.textContent = error?.name === "AbortError" ? "Sharing cancelled. Your result is still here." : "That action did not finish. Try again or copy this public link: " + GAME_URL + "?ending=" + id; }
      finally { busy = false; }
    }, "button button--secondary");
    controls.append(el);
  }
  action("Share ending", async (id, token) => {
    if (!navigator.share) return copy(id, token);
    await navigator.share({ title: "Can You Survive Your First Day in a Sect?", text: selected.name + " — a Quiet Bell Sect ending.", url: publicLink() });
    track("sect_game_action", id, "native");
    if (token === generation) status.textContent = "Ending shared. No decisions included.";
  });
  action("Copy ending link", copy);
  action("Download ending card", async (id, token) => {
    const canvas = document.createElement("canvas"); drawCard(canvas, id);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Card unavailable");
    if (token !== generation) return;
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = "fandom-vibes-sect-day-" + id + ".png";
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = "Card download started. Check your browser’s downloads.";
    track("sect_game_action", id, "download");
  });
}
function renderResult(shared, focus = true) {
  clear();
  progress.textContent = shared ? "Shared result · Not your completed playthrough" : "Complete · 5 of 5 decisions";
  heading(selected.name, focus);
  view.append(node("p", selected.description));
  if (!shared) view.append(node("p", selected.cause, "sect-consequence"));
  view.append(node("p", "Survival tactic / mistake: " + selected.tactic), node("p", "Ally: " + selected.ally));
  if (!shared) {
    view.append(node("h3", "Your decisions · This tab only"));
    const recap = node("ol", "", "sect-recap");
    trail.forEach((value, index) => recap.append(node("li", SCENES[index].title + ": " + SCENES[index].choices[value].label)));
    view.append(recap);
  } else view.append(node("p", "Someone shared this generic ending. Their decisions are not included. Play to discover what happens to you."));
  resultActions(shared);
}
controls.hidden = false;
document.querySelector("#start").addEventListener("click", start);
const incoming = incomingEnding(location.search);
// Remove arbitrary query values before any interaction telemetry; no run is URL-backed.
history.replaceState({}, "", location.pathname + (incoming ? "?ending=" + incoming.id : ""));
if (incoming) { phase = "shared"; selected = incoming; renderResult(true, false); }
