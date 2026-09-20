export const CAPABILITIES = Object.freeze([
  "fandom_collector",
  "creator_os",
  "fandom_creator_bridge",
  "ecosystem_bundle",
]);

const ALL = new Set(CAPABILITIES);
const PRODUCT_CAPABILITIES = {
  fandom_collector: ["fandom_collector"],
  collector: ["fandom_collector"],
  creator_os: ["creator_os"],
  "creator-os": ["creator_os"],
  fandom_creator_bridge: ["fandom_creator_bridge"],
  "fandom-creator-bridge": ["fandom_creator_bridge"],
  bridge: ["fandom_creator_bridge"],
  ecosystem_bundle: CAPABILITIES,
  "ecosystem-bundle": CAPABILITIES,
  ecosystem: CAPABILITIES,
};

function values(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(/[,\s]+/).filter(Boolean);
  return [];
}

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

export function capabilitiesForMembership(membership, env = process.env) {
  if (!membership || membership.status !== "active") return [];
  const metadata = membership.metadata || {};
  const explicit = [
    ...values(membership.capabilities),
    ...values(membership.capability),
    ...values(metadata.capabilities),
    ...values(metadata.capability),
    ...values(membership.products),
    ...values(metadata.products),
    ...values(metadata.product_capability),
    membership.product,
    metadata.product,
    membership.productName,
    metadata.product_name,
  ].filter(Boolean);
  const price = membership.priceId || membership.price_id || membership.price?.id
    || metadata.price_id || metadata.priceId;
  const result = new Set();
  for (const raw of explicit) {
    const key = normalize(raw);
    for (const capability of PRODUCT_CAPABILITIES[key] || (ALL.has(key) ? [key] : [])) {
      result.add(capability);
    }
  }

  if (price && price === env.FANDOM_STRIPE_MEMBERSHIP_PRICE_ID) result.add("fandom_collector");
  if (price && (price === env.FANDOM_CREATOR_OS_PRICE_ID
    || price === env.FANDOM_CREATOR_OS_MEMBERSHIP_PRICE_ID)) result.add("creator_os");
  if (price && (price === env.FANDOM_CREATOR_BRIDGE_PRICE_ID
    || price === env.FANDOM_FANDOM_CREATOR_BRIDGE_PRICE_ID)) result.add("fandom_creator_bridge");
  if (price && price === env.FANDOM_ECOSYSTEM_BUNDLE_PRICE_ID) result.add("ecosystem_bundle");
  if (result.has("ecosystem_bundle")) {
    for (const capability of CAPABILITIES) result.add(capability);
  }
  // Before product-specific entitlements existed, every active subscription
  // was the single Collector membership. Preserve those records, but fail
  // closed for any explicit product or price identifier that is not recognized.
  if (result.size === 0 && explicit.length === 0 && !price) result.add("fandom_collector");
  return CAPABILITIES.filter(capability => result.has(capability));
}

export function hasCapability(membership, capability, env = process.env) {
  return capabilitiesForMembership(membership, env).includes(capability);
}