import { defineApp } from "convex/server";
import waitlist from "./waitlist/convex.config";

const app = defineApp();
app.use(waitlist);

export default app;
