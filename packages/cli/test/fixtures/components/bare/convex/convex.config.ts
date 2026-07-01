import workpool from "@convex-dev/workpool/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(workpool);
app.use(workpool, { name: "secondPool" });

export default app;
