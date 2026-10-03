import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { publicRouteUrl } from "../shared/public-routes.js";

const REVIEW_COPY_URL = new URL("../docs/untamed-three-character-name-key-review.md", import.meta.url);
const NAME_KEY_PATH = "/c-drama-fandom/untamed-names-and-performers/";
const ROUTE_ORIGIN_URL = publicRouteUrl("/c-drama-fandom/untamed-name-board/");

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function inlineMarkdown(value) {
  const tokens = [];
  const tokenise = (html) => {
    const token = `\u0000${tokens.length}\u0000`;
    tokens.push(html);
    return token;
  };

  let text = escapeHtml(value);
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, (_match, label, href) => (
    tokenise(`<a href="${href}">${label}</a>`)
  ));
  text = text.replace(/\*\*([^*]+)\*\*/g, (_match, content) => tokenise(`<strong>${content}</strong>`));
  text = text.replace(/\*([^*]+)\*/g, (_match, content) => tokenise(`<em>${content}</em>`));
  return text.replace(/\u0000(\d+)\u0000/g, (_match, index) => tokens[Number(index)]);
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
}

function renderTable(rows) {
  const cellsFor = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
  const headers = cellsFor(rows[0]);
  const bodyRows = rows.slice(2);
  const renderedHeaders = headers.map((header) => `<th scope="col">${inlineMarkdown(header)}</th>`).join("");
  const renderedRows = bodyRows.map((row) => {
    const cells = cellsFor(row);
    return `<tr>${cells.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join("")}</tr>`;
  }).join("");

  return `<div class="comparison-table${headers.length === 2 ? " comparison-table--pair" : ""}" role="region" aria-label="Character and performer names; scroll horizontally on narrow screens" tabindex="0"><table><thead><tr>${renderedHeaders}</tr></thead><tbody>${renderedRows}</tbody></table></div>`;
}

function renderReaderBlocks(markdown) {
  const lines = markdown.split(/\r?\n/);
  const title = lines.find((line) => line.startsWith("# "))?.slice(2);
  if (!title) throw new Error("The approved reader-copy block has no title.");

  const contentLines = lines.slice(lines.indexOf(`# ${title}`) + 1);
  const firstH2 = contentLines.findIndex((line) => line.startsWith("## "));
  const heroLines = contentLines.slice(0, firstH2);
  const heroMeta = heroLines.find((line) => line.startsWith("**") && line.endsWith("**"));
  const heroDescription = heroLines.find((line) => line && line !== heroMeta);
  const bodyLines = contentLines.slice(firstH2);

  const sections = [];
  let currentSection = null;
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      currentSection.blocks.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };

  for (let index = 0; index < bodyLines.length; index += 1) {
    const line = bodyLines[index].trim();
    if (!line) {
      flushParagraph();
      continue;
    }
    if (line.startsWith("## ")) {
      flushParagraph();
      currentSection = { title: line.slice(3), blocks: [] };
      sections.push(currentSection);
      continue;
    }
    if (!currentSection) continue;
    if (line.startsWith("### ")) {
      flushParagraph();
      const heading = line.slice(4);
      currentSection.blocks.push(`<h3 id="${slugify(heading)}">${inlineMarkdown(heading)}</h3>`);
      continue;
    }
    if (line.startsWith("|")) {
      flushParagraph();
      const tableRows = [];
      while (index < bodyLines.length && bodyLines[index].trim().startsWith("|")) {
        tableRows.push(bodyLines[index].trim());
        index += 1;
      }
      index -= 1;
      currentSection.blocks.push(renderTable(tableRows));
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();

  const renderedSections = sections.map(({ title: sectionTitle, blocks }) => {
    const id = slugify(sectionTitle);
    return `<section aria-labelledby="${id}"><h2 id="${id}">${inlineMarkdown(sectionTitle)}</h2>${blocks.join("\n")}</section>`;
  }).join("\n");

  return {
    title,
    meta: heroMeta?.replace(/^\*\*|\*\*$/g, "") ?? "",
    description: heroDescription ?? "",
    sections: renderedSections,
  };
}

export function renderUntamedNameKey() {
  const review = readFileSync(REVIEW_COPY_URL, "utf8");
  const startMarker = "<!-- reader-copy:start -->";
  const endMarker = "<!-- reader-copy:end -->";
  const start = review.indexOf(startMarker);
  const end = review.indexOf(endMarker);
  if (start < 0 || end < start) throw new Error("Could not locate the approved reader-copy block.");

  const copy = review.slice(start + startMarker.length, end).trim();
  if (createHash("sha256").update(copy).digest("hex") !== "1ad5d130cae95ea9ba596920c6c69df5dc18eafb61ba1dbae94dfa7a50bfafef") {
    throw new Error("Untamed reader copy differs from the exact creator-approved block; obtain a new approval before changing it.");
  }
  const { title, meta, description, sections } = renderReaderBlocks(copy);
  const canonicalUrl = new URL(NAME_KEY_PATH, ROUTE_ORIGIN_URL).href;
  const escapedTitle = escapeHtml(title);
  const escapedDescription = escapeHtml(description.replace(/\*\*/g, ""));

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapedTitle}</title>
  <meta name="description" content="${escapedDescription}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta name="robots" content="index,follow">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Fandom Vibes">
  <meta property="og:title" content="${escapedTitle}">
  <meta property="og:description" content="${escapedDescription}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta name="twitter:card" content="summary">
  <link rel="stylesheet" href="/c-drama-fandom/styles.css">
  <style>.comparison-table--pair table { min-width: 0; table-layout: fixed; } .comparison-table--pair td { overflow-wrap: anywhere; }</style>
  <script defer src="/c-drama-fandom/editorial.js"></script>
  <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Article", headline: title, mainEntityOfPage: canonicalUrl, isPartOf: { "@type": "WebSite", name: "Fandom Vibes", url: publicRouteUrl("/") } })}</script>
</head>
<body data-source-page="untamed-names-and-performers" data-content-mode="fandom-literacy">
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <div class="site-header__inner">
      <a class="brand" href="/"><span class="brand__mark">FV</span><span><strong>Fandom Vibes</strong><small>Worldbuilding launchpad</small></span></a>
      <nav class="site-nav" aria-label="C-drama fandom">
        <a href="/c-drama-fandom/">Guide</a>
        <a href="/c-drama-fandom/getting-started/">Getting started</a>
        <a href="/c-drama-fandom/glossary/">Glossary</a>
        <a href="/c-drama-fandom/watch-journal/">Field journal</a>
        <a href="/vibe-atlas">Vibe Atlas</a>
      </nav>
    </div>
  </header>
  <main id="main">
    <header class="hero companion-reading-hero">
      <p class="breadcrumb"><a href="/c-drama-fandom/">C-drama fandom</a> / The Untamed name key</p>
      <p class="eyebrow">The Untamed / a pre-watch name key</p>
      <h1>${escapedTitle}</h1>
      <p class="meta-row">${inlineMarkdown(meta)}</p>
      <p class="hero__lede">${inlineMarkdown(description)}</p>
    </header>
    <div class="content-shell">
      <article class="article">
        ${sections}
      </article>
    </div>
  </main>
  <footer class="site-footer"><div class="site-footer__inner"><div><h2>Fandom Vibes</h2><p>A creative home for the tools, rituals, and artifacts fans make around the worlds they love.</p></div><div><strong>Learn</strong><a href="/c-drama-fandom/">C-drama fandom guide</a><a href="/c-drama-fandom/glossary/">Glossary</a></div><div><strong>Create</strong><a href="/vibe-atlas">Vibe Atlas</a></div></div></footer>
</body>
</html>
`;
}