import { defineConfig } from "vite-plus";

import oxfmtConfig from "./.oxfmtrc.json" with { type: "json" };
import oxlintConfig from "./.oxlintrc.json" with { type: "json" };

// Keep Oxlint/Oxfmt config in their dedicated rc files so the standalone
// `oxlint`/`oxfmt` binaries (used by the Claude Code hooks and editor
// integrations) and Vite+'s `vp lint`/`vp fmt`/`vp check` share one source of
// truth. `$schema` is rc-file metadata that the Vite+ blocks don't expect.
const { $schema: _lintSchema, ...lint } = oxlintConfig;
const { $schema: _fmtSchema, ...fmt } = oxfmtConfig;

export default defineConfig({
  lint,
  fmt,
});
