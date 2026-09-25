export function calibrationAuditExport(
  run: Record<string, any>,
  pair: {
    actor: { id: string };
    vibeKey: string;
  },
  humanVisualJudgments?: Record<string, any>[],
): Record<string, any>;