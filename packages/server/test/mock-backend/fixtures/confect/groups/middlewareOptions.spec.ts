import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import ProvideViewer from "../middleware/ProvideViewer.spec";
import RequireName from "../middleware/RequireName.spec";

export default GroupSpec.make()
  .middleware(ProvideViewer)
  .addFunction(
    FunctionSpec.publicQuery({
      name: "shortName",
      returns: () => Schema.String,
    }).middleware(RequireName, { minLength: 2 }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "longName",
      returns: () => Schema.String,
    }).middleware(RequireName, { minLength: 5 }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "mutation",
      returns: () => Schema.String,
    }).middleware(RequireName, { minLength: 4 }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "action",
      returns: () => Schema.String,
    }).middleware(RequireName, { minLength: 6 }),
  );
