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

it.each([
  [{ text: 1 }],
  [{ notes: [{ location: { line: "3" } }] }],
  [{ text: "message", invalidOption: true }],
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
