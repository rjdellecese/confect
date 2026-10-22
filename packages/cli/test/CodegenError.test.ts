import { expect, it } from "@effect/vitest";
import { stripVTControlCharacters } from "node:util";
import {
  isCodegenError,
  renderCodegenError,
  ScopedRefsPathOccupiedError,
} from "@confect/cli/CodegenError";
import { SnapshotError } from "@confect/cli/SnapshotError";

it("renders an authored scoped-reference path collision", () => {
  const error = new ScopedRefsPathOccupiedError({
    path: "/confect/_generated/refs/notes.ts",
    reason: "UnownedFile",
  });
  expect(isCodegenError(error)).toBe(true);
  expect(renderCodegenError(error)).toContain(
    "this file is not owned by Confect",
  );
  expect(stripVTControlCharacters(renderCodegenError(error))).toContain(
    error.path,
  );
});

it("recognizes and renders structured snapshot failures without dumping their cause", () => {
  const error = new SnapshotError({
    reason: "NoncanonicalPath",
    relativePath: "notes.spec.ts",
    pathSegments: ["other"],
    cause: { detail: "unrendered-cause" },
  });
  expect(isCodegenError(error)).toBe(true);
  const rendered = renderCodegenError(error);
  expect(rendered).toContain(
    "Invalid generation metadata (NoncanonicalPath) for notes.spec.ts at other.",
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
