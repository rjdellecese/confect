/**
 * Confect's internal oxlint rules, authored with `effect-oxlint`.
 *
 * The root `.oxlintrc.json` loads this module through its `jsPlugins` entry,
 * which means oxlint hands the specifier straight to Node's module loader: the
 * TypeScript module graph runs via Node's built-in type stripping, so it must
 * stay erasable-syntax-only and use explicit `.ts` extensions for relative
 * imports.
 */
import { Plugin } from "effect-oxlint";
import { preferEffectVitest } from "./preferEffectVitest.ts";
import { preferTestEach } from "./preferTestEach.ts";

export { preferEffectVitest, preferTestEach };

export default Plugin.define({
  name: "confect",
  specifier: "confect-oxlint-rules",
  rules: {
    "prefer-effect-vitest": preferEffectVitest,
    "prefer-test-each": preferTestEach,
  },
});
