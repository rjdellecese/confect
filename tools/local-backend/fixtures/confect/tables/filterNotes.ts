import { Table } from "@confect/core";
import * as Schema from "effect/Schema";

export default Table.make(() =>
  Schema.Struct({
    value: Schema.FiniteFromString,
    keep: Schema.Boolean,
  }),
).index("by_value", ["value"]);
