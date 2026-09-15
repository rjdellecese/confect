import { defineComponent } from "convex/server";
import counter from "../../counter/convex/convex.config";

const component = defineComponent("parent");
component.use(counter, { name: "child", httpPrefix: "/child" });
export default component;
