export interface ArchiveSearchRequestGate {
  begin(): number;
  invalidate(): void;
  isCurrent(requestId: number): boolean;
}

export function createArchiveSearchRequestGate(): ArchiveSearchRequestGate {
  let currentRequestId = 0;

  return {
    begin: () => {
      currentRequestId += 1;
      return currentRequestId;
    },
    invalidate: () => {
      currentRequestId += 1;
    },
    isCurrent: (requestId) => requestId === currentRequestId,
  };
}