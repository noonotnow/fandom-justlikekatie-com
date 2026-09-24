function canonicalSource(value) {
  return String(value || "").trim().toLowerCase();
}

function canonicalLink(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/\.+$/, "");
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.protocol}//${hostname}${path}${url.search}`;
  } catch {
    return String(value).trim();
  }
}

export function candidateFingerprint(result = {}) {
  return [
    String(result.thumbnail || ""),
    canonicalSource(result.source),
    canonicalLink(result.link),
  ].join("\u0000");
}
