/**
 * Client-facing Collector benefits.
 *
 * These are presentation and workflow allowances only. Account-scoped sync
 * and persisted exports remain protected by their existing server endpoints.
 */
export const FREE_CANVAS_ALLOWANCE = 1;
export const COLLECTOR_ADDITIONAL_CANVASES = 3;
export const COLLECTOR_CANVAS_ALLOWANCE =
  FREE_CANVAS_ALLOWANCE + COLLECTOR_ADDITIONAL_CANVASES;

export interface CollectorPalette {
  id: 'moonlit-ink';
  name: string;
  description: string;
  accent: string;
  surface: string;
}

export const COLLECTOR_PALETTES: readonly CollectorPalette[] = [
  {
    id: 'moonlit-ink',
    name: 'Moonlit Ink',
    description: 'An approved indigo-and-gold atmosphere for night-set boards.',
    accent: '#9f9bea',
    surface: '#17182b',
  },
];

export interface CollectorBenefits {
  isCollector: boolean;
  canvasAllowance: number;
  additionalCanvases: number;
  palettes: readonly CollectorPalette[];
  crossDevicePersistence: boolean;
}

export function collectorBenefits(isMember: boolean): CollectorBenefits {
  return {
    isCollector: isMember,
    canvasAllowance: isMember ? COLLECTOR_CANVAS_ALLOWANCE : FREE_CANVAS_ALLOWANCE,
    additionalCanvases: isMember ? COLLECTOR_ADDITIONAL_CANVASES : 0,
    palettes: isMember ? COLLECTOR_PALETTES : [],
    crossDevicePersistence: isMember,
  };
}