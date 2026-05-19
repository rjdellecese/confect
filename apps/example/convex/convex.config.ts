import { defineApp } from "convex/server";
import { v } from "convex/values";
import workpool from "@convex-dev/workpool/convex.config";

const app = defineApp({
  env: {
    TEST_ENV_VAR: v.string(),
  },
});
app.use(workpool, { name: "workpool" });

export default app;
