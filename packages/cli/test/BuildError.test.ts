import { assert, describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import {
  BundleFailedError,
  BundlerError,
  fromBundlerError,
  ImportFailedError,
} from "../src/BuildError";

describe("fromBundlerError", () => {
  it("preserves validated esbuild diagnostics without copying them", () => {
    const errors = [
      {
        id: "",
        pluginName: "",
        text: "Could not resolve module",
        location: {
          file: "notes.impl.ts",
          namespace: "file",
          line: 1,
          column: 0,
          length: 6,
          lineText: "import missing from 'missing'",
          suggestion: "",
        },
        notes: [{ text: "Check the import path", location: null }],
        detail: undefined,
      },
    ];

    const result = fromBundlerError(
      "notes.impl.ts",
      new BundlerError({ cause: { errors } }),
    );

    assert(Schema.is(BundleFailedError)(result));
    expect(result.file).toBe("notes.impl.ts");
    expect(result.errors).toBe(errors);
    expect(result.errors[0]).toBe(errors[0]);
  });

  it("keeps malformed diagnostic-like import failures in the import error channel", () => {
    const cause = { errors: [{ text: "not an esbuild diagnostic" }] };

    const result = fromBundlerError(
      "notes.impl.ts",
      new BundlerError({ cause }),
    );

    assert(Schema.is(ImportFailedError)(result));
    expect(result.file).toBe("notes.impl.ts");
    expect(result.cause).toBe(cause);
  });

  it("preserves primitive import failures", () => {
    const result = fromBundlerError(
      "notes.impl.ts",
      new BundlerError({ cause: "load failed" }),
    );

    assert(Schema.is(ImportFailedError)(result));
    expect(result.cause).toBe("load failed");
  });
});
