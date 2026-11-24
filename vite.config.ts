import { defineConfig } from "vite-plus";
import type { OxfmtConfig } from "vite-plus/fmt";

import oxfmtConfig from "./.oxfmtrc.json" with { type: "json" };
import lint from "./oxlint.config";

const { $schema: _fmtSchema, ...fmt } = oxfmtConfig;

export default defineConfig({
  lint,
  fmt: fmt as OxfmtConfig,
});
