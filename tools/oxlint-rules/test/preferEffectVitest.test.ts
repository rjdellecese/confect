import { describe, expect, it } from "@effect/vitest";
import type { Fixer } from "effect-oxlint";
import * as Testing from "effect-oxlint/testing";
import * as Option from "effect/Option";

import confectPlugin, { preferEffectVitest } from "../src/index";

const runOnImport = (source: string) =>
  Testing.runRule(
    preferEffectVitest,
    "ImportDeclaration",
    Testing.importDecl(source),
  );

describe("prefer-effect-vitest", () => {
  it("reports an import from vitest", () => {
    const result = runOnImport("vitest");

    expect(result).toHaveLength(1);
    expect(Option.getOrThrow(Testing.messages(result)[0]!)).toContain(
      '"@effect/vitest"',
    );
  });

  it("ignores an import from @effect/vitest", () => {
    Testing.expectNoDiagnostics(runOnImport("@effect/vitest"));
  });

  it("ignores vitest subpath imports", () => {
    Testing.expectNoDiagnostics(runOnImport("vitest/config"));
  });

  it("ignores unrelated imports", () => {
    Testing.expectNoDiagnostics(runOnImport("effect/Effect"));
  });

  it("allows importing only vi from vitest", () => {
    Testing.expectNoDiagnostics(
      Testing.runRule(
        preferEffectVitest,
        "ImportDeclaration",
        Testing.importDeclWithSpecifiers("vitest", [
          Testing.importSpecifier("vi"),
        ]),
      ),
    );
  });

  it("reports a mixed import without a fix", () => {
    const result = Testing.runRule(
      preferEffectVitest,
      "ImportDeclaration",
      Testing.importDeclWithSpecifiers("vitest", [
        Testing.importSpecifier("describe"),
        Testing.importSpecifier("vi"),
      ]),
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.diagnostic.fix).toBeUndefined();
  });

  it("reports a namespace import", () => {
    const result = Testing.runRule(
      preferEffectVitest,
      "ImportDeclaration",
      Testing.importDeclWithSpecifiers("vitest", [
        Testing.importNamespaceSpecifier("Vitest"),
      ]),
    );

    expect(result).toHaveLength(1);
  });

  it("autofixes the module specifier to @effect/vitest", () => {
    const result = runOnImport("vitest");

    const fix = result[0]!.diagnostic.fix;
    expect(fix).toBeDefined();

    const fixer = {
      replaceText: (ranged: unknown, text: string) => ({ ranged, text }),
    } as unknown as Fixer;

    expect(fix!(fixer)).toEqual({
      ranged: { type: "Literal", value: "vitest" },
      text: '"@effect/vitest"',
    });
  });
});

describe("plugin", () => {
  it("registers the rule under the confect namespace", () => {
    expect(confectPlugin.meta.name).toBe("confect");
    expect(Object.keys(confectPlugin.rules)).toEqual(["prefer-effect-vitest"]);
  });
});
