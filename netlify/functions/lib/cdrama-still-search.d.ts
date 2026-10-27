type StillSearchResult = { title?: string; thumbnail: string; link: string; source?: string };

export function createCdramaStillHandler(
  search?: (
    query: string,
    options: { providerPolicy: string; resultLimit: number },
  ) => Promise<{ results: StillSearchResult[] }>,
): (request: Request) => Promise<Response>;
