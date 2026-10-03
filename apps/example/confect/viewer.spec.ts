import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import RequireViewer from "./middleware/RequireViewer.spec";

export default GroupSpec.make()
  .middleware(RequireViewer)
  .addFunction(
    FunctionSpec.publicQuery({
      name: "whoAmI",
      returns: () => Schema.String,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "postNote",
      args: () => ({ text: Schema.String }),
      returns: () => Schema.Null,
    }),
  );
