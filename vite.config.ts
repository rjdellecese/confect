import { defineConfig } from "vite-plus";

import fmt from "./oxfmt.config";
import lint from "./oxlint.config";

export default defineConfig({ fmt, lint });
