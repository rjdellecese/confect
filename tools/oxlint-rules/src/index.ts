/**
 * Confect's internal oxlint rules, authored with `effect-oxlint`.
 *
 * The root `.oxlintrc.json` loads this module through its `jsPlugins` entry,
 * which means oxlint hands the specifier straight to Node's module loader:
 * the TypeScript here runs via Node's built-in type stripping, so it must
 * stay erasable-syntax-only, and any relative import would need an explicit
 * `.ts` extension (which the workspace tsconfig doesn't allow) — hence the
 * rules live in this single module.
 */
import type { ESTree } from "effect-oxlint";
import {
  AST,
  Diagnostic,
  Plugin,
  Rule,
  RuleContext,
  Visitor,
} from "effect-oxlint";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

const preferEffectVitestMessage =
  'Import from "@effect/vitest" instead of "vitest": it re-exports everything "vitest" does, alongside the Effect-aware test APIs (it.effect, layer, flakyTest, …). Only `vi` must come from "vitest" — the mocks API breaks when imported through a re-export.';

/**
 * Names that must be imported from `vitest` itself: Vitest resolves the
 * mocks API by the module specifier it is imported from, so `vi` pulled
 * through `@effect/vitest`'s `export * from "vitest"` fails at runtime with
 * "There are some problems in resolving the mocks API."
 */
const vitestOnlyNames = ["vi"];

const importedName = (
  specifier: ESTree.ImportDeclaration["specifiers"][number],
): Option.Option<string> => {
  if (specifier.type !== "ImportSpecifier") {
    return Option.none();
  }
  const imported = specifier.imported;
  return Option.some(
    imported.type === "Identifier" ? imported.name : String(imported.value),
  );
};

/**
 * Requires test files to import from `@effect/vitest` rather than `vitest`.
 *
 * `@effect/vitest` does `export * from "vitest"`, so every named export of
 * `vitest` (including `beforeEach`, `expectTypeOf`, …) is available from
 * it — which also makes rewriting the module specifier a safe autofix. The
 * exception is `vi` (see `vitestOnlyNames`): an import that pulls only
 * exempt names is allowed, and one that mixes exempt names with others is
 * reported without a fix, since it has to be split by hand. Subpath imports
 * like `vitest/config` are left alone; those belong to config files, not
 * tests.
 */
export const preferEffectVitest = Rule.define({
  name: "prefer-effect-vitest",
  meta: Rule.meta({
    type: "suggestion",
    description:
      'Import test APIs from "@effect/vitest" instead of "vitest" in test files.',
    fixable: "code",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    return Visitor.on("ImportDeclaration", (node) =>
      Option.match(AST.matchImport(node, "vitest"), {
        onNone: () => Effect.void,
        onSome: (matched) => {
          const importedNames = Arr.getSomes(
            Arr.map(matched.specifiers, importedName),
          );
          const isVitestOnly = (name: string) =>
            Arr.contains(vitestOnlyNames, name);

          if (
            Arr.isArrayNonEmpty(matched.specifiers) &&
            importedNames.length === matched.specifiers.length &&
            Arr.every(importedNames, isVitestOnly)
          ) {
            return Effect.void;
          }

          const diagnostic = Diagnostic.make({
            node: matched,
            message: preferEffectVitestMessage,
          });

          return ctx.report(
            Arr.some(importedNames, isVitestOnly)
              ? diagnostic
              : Diagnostic.withFix(
                  diagnostic,
                  Diagnostic.replaceText(matched.source, '"@effect/vitest"'),
                ),
          );
        },
      }),
    );
  },
});

export default Plugin.define({
  name: "confect",
  specifier: "confect-oxlint-rules",
  rules: {
    "prefer-effect-vitest": preferEffectVitest,
  },
});
