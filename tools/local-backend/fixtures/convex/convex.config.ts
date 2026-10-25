import { defineApp } from "convex/server";
import counter from "../components/counter/convex/convex.config";
import parent from "../components/parent/convex/convex.config";

const app = defineApp();
app.use(counter, { name: "first", httpPrefix: "/first" });
app.use(counter, { name: "second", httpPrefix: "/second" });
app.use(parent, { name: "left", httpPrefix: "/left" });
app.use(parent, { name: "right", httpPrefix: "/right" });
export default app;
