import { defineLocalBackendConfig } from "confect-local-backend/vitest";
import sharedConfig from "../../vitest.shared";

export default defineLocalBackendConfig({
  base: sharedConfig,
  root: import.meta.dirname,
  name: "@confect/server",
});
