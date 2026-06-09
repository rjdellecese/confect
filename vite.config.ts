import { defineConfig } from "vite-plus";
import type { OxfmtConfig } from "vite-plus/fmt";
import type { OxlintConfig } from "vite-plus/lint";

import oxfmtConfig from "./.oxfmtrc.json" with { type: "json" };
import oxlintConfig from "./.oxlintrc.json" with { type: "json" };

// Keep Oxlint/Oxfmt config in their dedicated rc files so the standalone
// `oxlint`/`oxfmt` binaries (used by the Claude Code hooks and editor
// integrations) and Vite+'s `vp lint`/`vp fmt`/`vp check` share one source of
// truth. `$schema` is rc-file metadata that the Vite+ blocks don't expect, and
// JSON imports widen literal fields (e.g. `"trailingComma": "all"`) to plain
// `string`, so the rc objects are cast back to the tools' config types.
const { $schema: _lintSchema, ...lint } = oxlintConfig;
const { $schema: _fmtSchema, ...fmt } = oxfmtConfig;

export default defineConfig({
  lint: lint as unknown as OxlintConfig,
  fmt: fmt as unknown as OxfmtConfig,
});
