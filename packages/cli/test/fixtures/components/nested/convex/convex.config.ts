import nested from "test-nested/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(nested);

export default app;
