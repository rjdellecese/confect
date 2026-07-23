import { afterEach, describe, expect, test } from "vitest";
import { installURLCanParsePolyfill } from "../../src/internal/urlCanParsePolyfill";

const nativeCanParse = URL.canParse;

const deleteCanParse = () => {
  delete (URL as { canParse?: typeof URL.canParse }).canParse;
};

afterEach(() => {
  Object.defineProperty(URL, "canParse", {
    value: nativeCanParse,
    writable: true,
    enumerable: false,
    configurable: true,
  });
});

describe("installURLCanParsePolyfill", () => {
  test("installs a spec-compliant canParse when missing", () => {
    deleteCanParse();

    installURLCanParsePolyfill();

    expect(typeof URL.canParse).toBe("function");
    expect(URL.canParse("https://example.com/path?query=1")).toBe(true);
    expect(URL.canParse(new URL("https://example.com"))).toBe(true);
    expect(URL.canParse("/relative", "https://example.com")).toBe(true);
    expect(URL.canParse("/relative")).toBe(false);
    expect(URL.canParse("not a url")).toBe(false);
  });

  test("leaves an existing canParse untouched", () => {
    installURLCanParsePolyfill();

    expect(URL.canParse).toBe(nativeCanParse);
  });
});
