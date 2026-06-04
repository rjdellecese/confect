import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import * as templates from "../src/templates";

const render = (
  overrides: Partial<
    Parameters<typeof templates.registeredFunctionsForGroup>[0]
  > = {},
) =>
  Effect.runSync(
    templates.registeredFunctionsForGroup({
      schemaImportPath: "../../schema",
      specImportPath: "../../../notes.spec",
      implImportPath: "../../../notes.impl",
      layerExportName: "notes",
      ...overrides,
    }),
  );

describe("registeredFunctionsForGroup", () => {
  it("uses the validator-compiling builders by default", () => {
    const convex = render();
    expect(convex).toContain(
      `import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";`,
    );
    expect(convex).toContain("RegisteredConvexFunction.make");
    expect(convex).not.toContain("WithoutValidators");

    const node = render({ useNode: true });
    expect(node).toContain(
      `import { RegisteredNodeFunction } from "@confect/server/node";`,
    );
    expect(node).toContain("RegisteredNodeFunction.make");
    expect(node).not.toContain("WithoutValidators");
  });

  it("routes through the validator-free builders when skipValidators is set", () => {
    const convex = render({ skipValidators: true });
    expect(convex).toContain(
      `import { RegisteredConvexFunctionWithoutValidators, RegisteredFunctions } from "@confect/server";`,
    );
    expect(convex).toContain("RegisteredConvexFunctionWithoutValidators.make");

    const node = render({ useNode: true, skipValidators: true });
    expect(node).toContain(
      `import { RegisteredNodeFunctionWithoutValidators } from "@confect/server/node";`,
    );
    expect(node).toContain("RegisteredNodeFunctionWithoutValidators.make");
  });

  it("keeps the schema/impl/spec wiring identical regardless of the flag", () => {
    // Only the builder import + symbol differ; the databaseSchema value import,
    // the type-only spec import, and the buildForGroup call are unchanged so the
    // import-isolation invariants continue to hold.
    const on = render({ skipValidators: false });
    const off = render({ skipValidators: true });
    for (const line of [
      `import databaseSchema from "../../schema";`,
      `import notes from "../../../notes.impl";`,
      `typeof import("../../../notes.spec")["default"]`,
    ]) {
      expect(on).toContain(line);
      expect(off).toContain(line);
    }
  });
});
