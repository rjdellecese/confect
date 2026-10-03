import { Table } from "@confect/core";
import * as Schema from "effect/Schema";

export default Table.make(() =>
  Schema.Struct({
    caseId: Schema.String,
    value: Schema.String,
  }),
).index("by_caseId", ["caseId"]);
