// Convex's UDF isolate provides a `URL` polyfill without the static
// `URL.canParse`, which Effect's `Schema.URLFromString` decode relies on.
// Install a spec-compliant fallback so string→URL schemas work in Convex
// queries and mutations — for Confect's own storage services and user
// schemas alike.
export const installURLCanParsePolyfill = (): void => {
  try {
    if (typeof URL !== "undefined" && typeof URL.canParse !== "function") {
      Object.defineProperty(URL, "canParse", {
        value: (url: string | URL, base?: string | URL): boolean => {
          try {
            return Boolean(new URL(url, base));
          } catch {
            return false;
          }
        },
        writable: true,
        enumerable: false,
        configurable: true,
      });
    }
  } catch {
    // The global is not patchable in this runtime; leave it as-is.
  }
};

installURLCanParsePolyfill();
