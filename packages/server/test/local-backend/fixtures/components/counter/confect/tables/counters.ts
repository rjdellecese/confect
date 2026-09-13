import { Table } from "@confect/core";
import * as Schema from "effect/Schema";

export default Table.make(() =>
  Schema.Struct({
    run: Schema.String,
    count: Schema.FiniteFromString,
  }),
).index("by_run", ["run"]);
