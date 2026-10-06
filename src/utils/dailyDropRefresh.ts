function waitForRefresh(signal: AbortSignal, delay: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(signal.reason || new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delay);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

/** Only today's preparing response is retried; errors and archive gates are not. */
export async function fetchDailyDropWithPolling(
  url: string,
  signal: AbortSignal,
  {
    fetchImpl = fetch,
    maxAttempts = 60,
    intervalMs = 5_000,
  }: {
    fetchImpl?: typeof fetch;
    maxAttempts?: number;
    intervalMs?: number;
  } = {},
): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    signal.throwIfAborted();
    const response = await fetchImpl(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
      cache: 'no-store',
    });
    if (response.status !== 202 || attempt + 1 >= maxAttempts) return response;
    const data = await response.clone().json().catch(() => null) as { building?: boolean } | null;
    if (data?.building !== true) return response;
    await waitForRefresh(signal, intervalMs);
  }
}
