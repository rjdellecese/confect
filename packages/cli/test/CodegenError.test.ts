import { expect, it } from "@effect/vitest";
import { isCodegenError, renderCodegenError } from "@confect/cli/CodegenError";
import { SnapshotError } from "@confect/cli/SnapshotError";

it("recognizes and renders structured snapshot failures without dumping their cause", () => {
  const error = new SnapshotError({
    reason: "RootMismatch",
    relativePath: "notes.spec.ts",
    pathSegments: ["other"],
    cause: { detail: "unrendered-cause" },
  });
  expect(isCodegenError(error)).toBe(true);
  const rendered = renderCodegenError(error);
  expect(rendered).toContain(
    "Invalid generation metadata (RootMismatch) for notes.spec.ts at other.",
  );
  expect(rendered).not.toContain("unrendered-cause");
});

it("renders malformed snapshot input without inventing a source location", () => {
  const error = new SnapshotError({
    reason: "InvalidShape",
    relativePath: "",
    pathSegments: [],
  });
  const rendered = renderCodegenError(error);
  expect(rendered).toContain("Invalid generation metadata (InvalidShape).");
  expect(rendered).not.toContain(" for ");
  expect(rendered).not.toContain(" at ");
});
