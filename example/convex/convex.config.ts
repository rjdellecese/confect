import presence from "@convex-dev/presence/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(presence);
export default app;
