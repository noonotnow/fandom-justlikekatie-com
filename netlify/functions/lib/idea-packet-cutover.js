const ACTIVE_MODE = "active";
const READ_ONLY_MODE = "read-only";
const REPLACEMENT_URL = "https://create.justlikekatie.com";

export class IdeaPacketModeError extends Error {
  constructor(value) {
    super(`FANDOM_IDEA_PACKETS_MODE must be "${ACTIVE_MODE}" or "${READ_ONLY_MODE}", received ${JSON.stringify(value)}.`);
    this.code = "FANDOM_IDEA_PACKETS_MODE_INVALID";
  }
}

export function getIdeaPacketMode(env = process.env) {
  const value = Object.prototype.hasOwnProperty.call(env, "FANDOM_IDEA_PACKETS_MODE")
    ? env.FANDOM_IDEA_PACKETS_MODE
    : ACTIVE_MODE;
  if (value !== ACTIVE_MODE && value !== READ_ONLY_MODE) {
    throw new IdeaPacketModeError(value);
  }
  return value;
}

export function isIdeaPacketReadOnly(env = process.env) {
  return getIdeaPacketMode(env) === READ_ONLY_MODE;
}

export function ideaPacketDeprecationHeaders() {
  return {
    Deprecation: "true",
    Link: `<${REPLACEMENT_URL}>; rel="successor-version"`,
  };
}

export function ideaPacketReadOnlyResponse() {
  return jsonResponse(423, {
    code: "FANDOM_IDEA_PACKETS_READ_ONLY",
    error: "Fandom Idea Packets are read-only during migration. Continue in CREATE.",
    replacementUrl: REPLACEMENT_URL,
  });
}

export function ideaPacketInvalidModeResponse() {
  return jsonResponse(503, {
    code: "FANDOM_IDEA_PACKETS_MODE_INVALID",
    error: "Fandom Idea Packets mode is invalid.",
  });
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...ideaPacketDeprecationHeaders(),
    },
  });
}
