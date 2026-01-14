import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    root: import.meta.dirname,
  },
});
