const NS = "http://www.w3.org/2000/svg";
const COPY_T = "Keep your little collection.";
const COPY_B = "Save your stickers and cassette design to your free account, and bring them along when you visit from another device.";

function focusables(el) {
  return Array.from(el.querySelectorAll("button,input,a[href],[tabindex]:not([tabindex='-1'])")).filter((n) => !n.disabled);
}
function trap(e) {
  if (e.key !== "Tab") return;
  const l = focusables(e.currentTarget);
  if (!l.length) return;
  const f = l[0], z = l[l.length - 1];
  if (e.shiftKey && document.activeElement === f) { e.preventDefault(); z.focus(); }
  else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); f.focus(); }
}

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "class") e.className = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c);
  return e;
}
function s(tag, attrs, ...kids) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
  for (const c of kids.flat()) if (c) e.append(c);
  return e;
}

const CASE_URL = new URL("./art/cassette-case.svg", import.meta.url).href;
const ART = {
  first_flight: new URL("./art/sticker-first-flight.svg", import.meta.url).href,
  first_landing: new URL("./art/sticker-first-landing.svg", import.meta.url).href,
};

export function cassetteSvg(cassette, label) {
  const earned = (cassette && cassette.earned) || [];
  const placed = (cassette && cassette.placed) || {};
  const svg = s("svg", { viewBox: "0 0 830 522.9", role: "img", "aria-label": label || "Your cassette", class: "qk-cassette-svg" });
  const base = s("image", { width: 830, height: 522.9 });
  base.setAttribute("href", CASE_URL);
  svg.append(base);
  for (const id of earned) {
    const p = placed[id];
    if (!p || !ART[id]) continue;
    const x = 419 - 325 + Number(p.x) * 662, y = 279 - 225 + Number(p.y) * 208;
    const deg = (Number(p.angle) || 0) * 180 / Math.PI;
    const im = s("image", { x: -72, y: -72, width: 144, height: 144, transform: `translate(${x} ${y}) rotate(${deg})` });
    im.setAttribute("href", ART[id]);
    svg.append(im);
  }
  return svg;
}

export function cassetteFigure(cassette, label) {
  const earned = (cassette && cassette.earned) || [];
  const placed = (cassette && cassette.placed) || {};
  const loose = earned.filter((id) => ART[id] && !placed[id]);
  const fig = h("div", { class: "qk-cassette-figure" }, cassetteSvg(cassette, label));
  if (loose.length) {
    fig.append(h("div", { class: "qk-cassette-earned" }, h("span", {}, "Earned, ready to place"),
      loose.map((id) => h("img", { src: ART[id], alt: id === "first_flight" ? "First flight sticker" : "First landing sticker", width: 48, height: 48 }))));
  }
  return fig;
}

export function mountCassetteView(root, controller, { page = "game", gameUrl = "/", cornerUrl = "/my-corner/" } = {}) {
  let emailVal = "";
  let backupOpen = false;
  let opener = null;
  const corner = page === "corner";
  const wrap = h("div", { class: "qk-cassette-root qk-cassette-" + (corner ? "corner" : "dock") });
  root.append(wrap);

  const preview = (c, title, action, onClick) =>
    h("div", { class: "qk-cassette-choice" }, h("h3", {}, title), cassetteFigure(c, title), h("button", { type: "button", class: "qk-cassette-btn", onclick: onClick }, action));

  function render() {
    const st = controller.state || {};
    const act = document.activeElement;
    const oldCard = wrap.querySelector(".qk-cassette-card");
    const inCard = !!(oldCard && act && oldCard.contains(act));
    const oldList = oldCard ? focusables(oldCard) : [];
    const idx = inCard ? oldList.indexOf(act) : -1;
    const caret = inCard && act.id === "qk-cassette-email" ? [act.selectionStart, act.selectionEnd] : null;
    if (!oldCard && act && act !== document.body && !wrap.contains(act)) opener = act;
    else if (!oldCard && act && wrap.contains(act)) opener = null;
    const member = st.phase === "member";
    const c = st.cassette || { version: 1, earned: [], placed: {} };
    const kids = [];

    if (corner) {
      kids.push(h("section", { class: "qk-cassette-hero" },
        h("div", { class: "qk-cassette-eyebrow" }, "My corner"),
        h("h1", {}, "Your cassette"),
        cassetteFigure(c, "Your cassette with your earned stickers"),
        h("p", { class: "qk-cassette-note" }, c.earned && c.earned.length ? "Every sticker here was earned in play, shown with your cassette design." : "No stickers yet. Take a cloud ride and your first one will land here."),
        h("a", { class: "qk-cassette-btn qk-cassette-primary", href: gameUrl }, "Visit your qilin")));
    }

    const panel = h("section", { class: "qk-cassette-panel", "aria-label": "Cassette saving" });
    if (st.phase === "loading") panel.append(h("p", { class: "qk-cassette-muted" }, "Checking your cassette…"));
    else if (st.phase === "unavailable") panel.append(h("p", { class: "qk-cassette-muted" }, st.localPersistent === false ? "Account saving is unavailable right now, and this browser is not keeping your cassette. Export a backup to keep it." : "Account saving is unavailable right now. Your cassette is still kept in this browser."));

    if (st.invitation && !member && !st.signinOpen && !st.conflict) {
      panel.append(h("div", { class: "qk-cassette-invite" }, h("h2", {}, COPY_T), h("p", {}, COPY_B),
        h("div", { class: "qk-cassette-row" },
          h("button", { type: "button", class: "qk-cassette-btn qk-cassette-primary", onclick: () => controller.openSignin() }, "Save my cassette"),
          h("button", { type: "button", class: "qk-cassette-btn qk-cassette-quiet", onclick: () => controller.dismissInvitation() }, "Not now"))));
    }

    const row = h("div", { class: "qk-cassette-row" });
    if (member) {
      row.append(h("button", { type: "button", class: "qk-cassette-btn", disabled: st.busy, "aria-busy": st.busy ? "true" : null, onclick: () => controller.save() }, st.busy ? "Saving…" : "Save my cassette"),
        h("button", { type: "button", class: "qk-cassette-btn qk-cassette-quiet", disabled: st.busy, onclick: () => controller.signout() }, "Sign out"));
    } else if (st.phase !== "loading") {
      row.append(h("button", { type: "button", class: "qk-cassette-btn", disabled: st.busy, onclick: () => controller.openSignin() }, "Save my cassette"));
    }
    panel.append(row);
    if (member && st.user) panel.append(h("p", { class: "qk-cassette-muted" }, "Signed in as " + st.user.email));
    if (st.saved) panel.append(h("p", { class: "qk-cassette-saved" }, "Saved to your account"));
    if (st.status) panel.append(h("p", { class: "qk-cassette-muted", role: "status" }, st.status));
    if (st.error) panel.append(h("p", { class: "qk-cassette-error", role: "alert" }, st.error));
    panel.append(h("p", { class: "qk-cassette-fine" }, "Without an account, your cassette stays in this browser" + (st.localPersistent === false ? ", and this browser is not keeping it right now" : "") + ". Clearing site data or browsing privately can remove it."));

    const det = h("details", { class: "qk-cassette-backup", ontoggle: (e) => { backupOpen = e.target.open; } },
      h("summary", {}, "Backup and transfer"),
      h("p", { class: "qk-cassette-fine" }, "Moving from the early preview? Export a backup file here, then import it wherever you play next."),
      h("div", { class: "qk-cassette-row" },
        h("button", { type: "button", class: "qk-cassette-btn qk-cassette-quiet", onclick: () => controller.exportBackup() }, "Export backup"),
        h("label", { class: "qk-cassette-btn qk-cassette-quiet" }, "Import backup",
          h("input", { type: "file", accept: ".json,application/json", class: "qk-cassette-file", onchange: (e) => { const f = e.target.files && e.target.files[0]; if (f) controller.importBackup(f); e.target.value = ""; } }))));
    if (backupOpen) det.open = true;
    panel.append(det);
    if (!corner) panel.append(h("a", { class: "qk-cassette-link", href: cornerUrl }, "My corner"));
    kids.push(panel);

    if (st.signinOpen && !member) {
      const form = h("form", { class: "qk-cassette-card", role: "dialog", "aria-modal": "true", "aria-labelledby": "qk-cassette-st", tabindex: "-1", onsubmit: (e) => { e.preventDefault(); if (emailVal.trim() && !st.busy) controller.requestSignin(emailVal.trim()); }, onkeydown: (e) => { trap(e); if (e.key === "Escape") controller.cancelSignin(); } },
        h("h2", { id: "qk-cassette-st" }, COPY_T), h("p", {}, COPY_B));
      if (st.signinSent) {
        form.append(h("p", { class: "qk-cassette-saved", role: "status" }, "Check your email for a sign-in link. This page will pick up where you left off."));
      } else {
        form.append(h("label", { for: "qk-cassette-email" }, "Email"),
          h("input", { id: "qk-cassette-email", type: "email", required: true, autocomplete: "email", value: emailVal, oninput: (e) => { emailVal = e.target.value; } }));
      }
      if (st.error) form.append(h("p", { class: "qk-cassette-error", role: "alert" }, st.error));
      form.append(h("div", { class: "qk-cassette-row" },
        !st.signinSent && h("button", { type: "submit", class: "qk-cassette-btn qk-cassette-primary", disabled: st.busy, "aria-busy": st.busy ? "true" : null }, st.busy ? "Sending…" : "Email me a link"),
        h("button", { type: "button", class: "qk-cassette-btn qk-cassette-quiet", onclick: () => controller.cancelSignin() }, st.signinSent ? "Close" : "Cancel")));
      kids.push(h("div", { class: "qk-cassette-scrim" }, form));
    }

    if (st.conflict) {
      kids.push(h("div", { class: "qk-cassette-scrim" }, h("div", { class: "qk-cassette-card qk-cassette-wide", role: "dialog", "aria-modal": "true", "aria-labelledby": "qk-cassette-ct", tabindex: "-1", onkeydown: (e) => { trap(e); if (e.key === "Escape") controller.choose("cancel"); } },
        h("h2", { id: "qk-cassette-ct" }, "Two cassettes found"),
        h("p", {}, "This browser and your account each have a cassette. Pick the one to keep; nothing is replaced until you choose."),
        h("div", { class: "qk-cassette-choices" },
          preview(st.conflict.local, "On this device", "Use this cassette", () => controller.choose("local")),
          preview(st.conflict.remote, "In your account", "Use account cassette", () => controller.choose("remote"))),
        st.error && h("p", { class: "qk-cassette-error", role: "alert" }, st.error),
        h("button", { type: "button", class: "qk-cassette-btn qk-cassette-quiet", onclick: () => controller.choose("cancel") }, "Decide later"))));
    }

    wrap.replaceChildren(...kids);
    const card = wrap.querySelector(".qk-cassette-card");
    if (card) {
      if (!oldCard) { const l = focusables(card); (l[0] || card).focus(); }
      else if (idx >= 0) {
        const l = focusables(card); const n = l[Math.min(idx, l.length - 1)];
        if (n) { n.focus(); if (caret && n.setSelectionRange) try { n.setSelectionRange(caret[0], caret[1]); } catch (e) {} }
      } else if (!card.contains(document.activeElement)) (focusables(card)[0] || card).focus();
    } else if (oldCard) {
      const o = opener && opener.isConnected ? opener : wrap.querySelector(".qk-cassette-btn");
      if (o) o.focus();
      opener = null;
    }
  }

  const un = controller.subscribe(render);
  return () => { if (typeof un === "function") un(); wrap.remove(); };
}
