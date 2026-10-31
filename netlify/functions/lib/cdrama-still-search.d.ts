type StillSearchResult = { title?: string; thumbnail: string; link: string; source?: string };

export function createCdramaStillHandler(
  search?: (
    query: string,
    options: { providerPolicy: string; resultLimit: number },
  ) => Promise<{ results: StillSearchResult[] }>,
  recapOptions?: Record<string, unknown>,
  sceneOptions?: Record<string, unknown>,
  similar?: (
    image: string,
    options: { signal: AbortSignal },
  ) => Promise<{ results: StillSearchResult[]; warning?: string }>,
): (request: Request) => Promise<Response>;
