export const CAPABILITIES = Object.freeze([
  "fandom_collector",
  "creator_os",
  "fandom_creator_bridge",
  "ecosystem_bundle",
]);

export const MEMBERSHIP_PRICE_MAPPINGS = Object.freeze([
  Object.freeze({
    product: "fandom_collector",
    envKeys: Object.freeze(["FANDOM_STRIPE_MEMBERSHIP_PRICE_ID"]),
  }),
  Object.freeze({
    product: "creator_os",
    envKeys: Object.freeze(["FANDOM_CREATOR_OS_PRICE_ID"]),
  }),
  Object.freeze({
    product: "fandom_creator_bridge",
    envKeys: Object.freeze(["FANDOM_CREATOR_BRIDGE_PRICE_ID"]),
  }),
  Object.freeze({
    product: "ecosystem_bundle",
    envKeys: Object.freeze(["FANDOM_ECOSYSTEM_BUNDLE_PRICE_ID"]),
  }),
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
  const products = new Set(MEMBERSHIP_PRICE_MAPPINGS
    .filter(mapping => mapping.envKeys.some(key => env[key] === price))
    .map(mapping => mapping.product));
  return products.size === 1 ? [...products][0] : null;
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