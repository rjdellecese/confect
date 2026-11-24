export const mockFetch = (
  run: (...args: Parameters<typeof globalThis.fetch>) => Promise<Response>,
) => Object.assign(run, { preconnect: () => undefined });
