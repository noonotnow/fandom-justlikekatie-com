export function hasValidReceiptTimestamp(value, timestampField) {
  const timestamp = value?.[timestampField];
  if (typeof timestamp !== "string") return false;
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === timestamp;
}