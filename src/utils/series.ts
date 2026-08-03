export const SERIES_OPTIONS = [
  { value: 'A·Vibe', label: 'A · Vibe' },
  { value: 'B·Style', label: 'B · Explainer' },
  { value: 'C·Event', label: 'C · BTS' },
  { value: 'D·BTS', label: 'D · 念无双' },
  { value: 'E·Fashion', label: 'E · Dog' },
  { value: 'F·Interview', label: 'F · Proverb' },
  { value: 'G·Fan', label: 'G · Aerial' },
  { value: 'H·Cdrama', label: 'H · Cdrama' },
] as const;

const SERIES_LABELS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(SERIES_OPTIONS.map(({ value, label }) => [value.charAt(0), label])),
);

export function getSeriesLabel(series: string | null | undefined): string {
  const value = series?.trim() ?? '';
  if (!value) return '';

  const code = value.match(/^([A-H])(?:\s*·|\s*$)/)?.[1];
  return code ? SERIES_LABELS[code] : value;
}
