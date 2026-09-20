export const CAPABILITIES = Object.freeze([
  "fandom_collector",
  "creator_os",
  "fandom_creator_bridge",
  "ecosystem_bundle",
]);

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

const CANONICAL_PRODUCTS = new Map([
  ["fandom_collector", "fandom_collector"],
  ["collector", "fandom_collector"],
  ["creator_os", "creator_os"],
  ["creator-os", "creator_os"],
  ["fandom_creator_bridge", "fandom_creator_bridge"],
  ["fandom-creator-bridge", "fandom_creator_bridge"],
  ["bridge", "fandom_creator_bridge"],
  ["ecosystem_bundle", "ecosystem_bundle"],
  ["ecosystem-bundle", "ecosystem_bundle"],
  ["ecosystem", "ecosystem_bundle"],
]);

function values(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(/[,\s]+/).filter(Boolean);
  return [];
}

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

export function productForPrice(price, env = process.env) {
  if (!price) return null;
  if (price === env.FANDOM_STRIPE_MEMBERSHIP_PRICE_ID) return "fandom_collector";
  if (price === env.FANDOM_CREATOR_OS_PRICE_ID
    || price === env.FANDOM_CREATOR_OS_MEMBERSHIP_PRICE_ID) return "creator_os";
  if (price === env.FANDOM_CREATOR_BRIDGE_PRICE_ID
    || price === env.FANDOM_FANDOM_CREATOR_BRIDGE_PRICE_ID) return "fandom_creator_bridge";
  if (price === env.FANDOM_ECOSYSTEM_BUNDLE_PRICE_ID) return "ecosystem_bundle";
  return null;
}

export function explicitProductForMembership(membership, env = process.env) {
  const metadata = membership?.metadata || {};
  const namedValues = [
    ...values(membership?.capabilities),
    ...values(membership?.capability),
    ...values(metadata.capabilities),
    ...values(metadata.capability),
    ...values(membership?.products),
    ...values(metadata.products),
    membership?.productCapability,
    metadata.product_capability,
    membership?.product,
    metadata.product,
    membership?.productName,
    metadata.product_name,
  ].filter(Boolean);
  const named = namedValues.map(value => CANONICAL_PRODUCTS.get(normalize(value)));
  if (named.some(product => !product)) return null;
  const price = membership?.priceId || membership?.price_id || membership?.price?.id
    || metadata.price_id || metadata.priceId;
  const priced = productForPrice(price, env);
  if (price && !priced) return null;
  const products = new Set([...named, ...(priced ? [priced] : [])]);
  return products.size === 1 ? [...products][0] : null;
}

export function capabilitiesForMembership(membership, env = process.env) {
  if (!membership || membership.status !== "active") return [];
  const product = explicitProductForMembership(membership, env);
  return product ? [...PRODUCT_CAPABILITIES[product]] : [];
}

export function hasCapability(membership, capability, env = process.env) {
  return capabilitiesForMembership(membership, env).includes(capability);
}