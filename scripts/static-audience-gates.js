import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const googleBootstrap = /googletagmanager\.com|google-analytics\.com|\bgtag\s*\(\s*["'](?:config|js)["']/i;

// Static articles are partly hand-authored. Validate the filesystem, not a
// curated page list, so a newly published article cannot silently bypass auth.
export function assertAudienceGatedHtml(html, label = "HTML") {
  const scripts = [...html.matchAll(scriptPattern)];
  const gates = scripts.filter(([, attrs]) => (
    /\bsrc\s*=\s*["']\/audience-gate\.js["']/i.test(attrs)
  ));
  const failures = [];
  if (gates.length > 1) failures.push("duplicate audience gate");
  if (gates.some(([, attrs]) => /\b(?:async|defer)\b|\btype\s*=/i.test(attrs))) {
    failures.push("audience gate must load synchronously before event callers");
  }
  for (const script of scripts) {
    const [, attrs, body] = script;
    if (googleBootstrap.test(`${attrs}\n${body}`)) {
      failures.push("unconditional Google bootstrap; use /audience-gate.js");
    }
    if (/\bdataLayer\s*\.\s*push\s*\(/.test(body)) {
      failures.push("raw dataLayer push bypasses the audience gate");
    }
    if (/\bgtag\s*\(/.test(body)
      && (!gates.length || script.index < gates[0].index)) {
      failures.push("Google event caller precedes the audience gate");
    }
  }
  if (/<iframe\b[^>]*(?:googletagmanager\.com|google-analytics\.com)/i.test(html)) {
    failures.push("unconditional Google tracking iframe");
  }
  if (failures.length) throw new Error(`${label}: ${[...new Set(failures)].join("; ")}`);
}

export function assertStaticAudienceGates(root) {
  const pages = [join(root, "index.html")];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith(".html")) pages.push(path);
    }
  }
  visit(join(root, "public"));
  const failures = [];
  for (const page of pages) {
    try {
      assertAudienceGatedHtml(readFileSync(page, "utf8"), relative(root, page));
    } catch (error) {
      failures.push(error.message);
    }
  }
  if (failures.length) {
    throw new Error(`Static audience tracking validation failed:\n${failures.join("\n")}`);
  }
  return pages.length;
}