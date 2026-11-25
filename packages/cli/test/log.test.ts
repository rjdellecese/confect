import { BundleFailedError } from "@confect/cli/BuildError";
import { renderBuildError } from "@confect/cli/log";
import { expect, it } from "@effect/vitest";

it("formats partial esbuild diagnostics without altering the original plugin payload", () => {
  const errors = [
    {
      text: "Invalid export",
      pluginName: undefined,
      location: { file: "config.ts", line: 3 },
      notes: [{ text: "Declared here" }],
      detail: new Error("hidden plugin detail"),
    },
  ];
  const error = BundleFailedError.make({ file: "config.ts", errors });
  const rendered = renderBuildError(error);
  expect(rendered).toContain("Invalid export");
  expect(rendered).toContain("Declared here");
  expect(rendered).not.toContain("hidden plugin detail");
  expect(error.errors[0]).toBe(errors[0]);
  expect(errors[0]?.location).toEqual({ file: "config.ts", line: 3 });
});

it("ignores enumerable symbol metadata on messages, notes, and locations", () => {
  const metadata = Symbol("plugin metadata");
  const withMetadata = <A extends object>(fields: A) => ({
    ...fields,
    get [metadata]() {
      throw new Error("Unexpected metadata read");
    },
  });
  const location = withMetadata({ file: "config.ts", line: 3 });
  const note = withMetadata({ text: "Declared here", location });
  const message = withMetadata({
    text: "Invalid export",
    notes: [note],
    location,
  });

  const rendered = renderBuildError(
    BundleFailedError.make({ file: "config.ts", errors: [message] }),
  );

  expect(rendered).toContain("Invalid export");
  expect(rendered).toContain("Declared here");
  expect(rendered).toContain("config.ts:3");
  for (const value of [message, note, location]) {
    expect(metadata in value).toBe(true);
  }
});

it.each([
  [{ text: 1 }],
  [{ notes: [{ location: { line: "3" } }] }],
  [{ text: "message", invalidOption: true }],
  [{ notes: [{ invalidOption: true }] }],
  [{ location: { invalidOption: true } }],
])(
  "reports malformed esbuild diagnostics without printing arbitrary plugin details",
  (message) => {
    const error = BundleFailedError.make({
      file: "config.ts",
      errors: [{ ...message, detail: "hidden plugin detail" }],
    });
    const rendered = renderBuildError(error);
    expect(rendered).toContain("malformed esbuild diagnostics");
    expect(rendered).toContain("config.ts");
    expect(rendered).not.toContain("hidden plugin detail");
  },
);
