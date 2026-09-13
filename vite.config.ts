import { recommended as effectTsgoRecommended } from "@effect/tsgo/oxlint-presets";
import { defineConfig } from "vite-plus";
import type { OxfmtConfig } from "vite-plus/fmt";
import type { OxlintConfig } from "vite-plus/lint";

import oxfmtConfig from "./.oxfmtrc.json" with { type: "json" };
import oxlintConfig from "./.oxlintrc.json" with { type: "json" };

// Keep Oxlint/Oxfmt config in their dedicated rc files so the standalone
// `oxlint`/`oxfmt` binaries (used by agents and editor
// integrations) and Vite+'s `vp lint`/`vp fmt`/`vp check` share one source of
// truth. `$schema` is rc-file metadata that the Vite+ blocks don't expect, and
// JSON imports widen literal fields (e.g. `"trailingComma": "all"`) to plain
// `string`, so the rc objects are cast back to the tools' config types.
const { $schema: _lintSchema, extends: _lintExtends, ...lint } = oxlintConfig;

const { $schema: _fmtSchema, ...fmt } = oxfmtConfig;

export default defineConfig({
  // SAFETY: Oxlint validates these JSON rule and plugin settings at startup; JSON imports widen their literal option types.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- Oxlint validates the shared JSON settings at startup; JSON imports lose literal tuple types required by its configuration interface.
  lint: {
    ...lint,
    extends: [effectTsgoRecommended],
  } as unknown as OxlintConfig,
  // SAFETY: Oxfmt validates this shared JSON configuration; its imported string options lose their literal types.
  fmt: fmt as OxfmtConfig,
});
