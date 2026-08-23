import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";

/**
 * Middleware-free helpers backing the `middleware` group's action-type
 * `ProvideViewer` implementation, which loads the viewer via `QueryRunner`
 * (the only database route in actions).
 */
export default GroupSpec.make().addFunction(
  FunctionSpec.internalQuery({
    name: "firstUsername",
    args: () => Schema.Struct({}),
    returns: () => Schema.NullOr(Schema.String),
  }),
);
