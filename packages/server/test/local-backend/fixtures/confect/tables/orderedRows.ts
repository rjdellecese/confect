import { Table } from "@confect/core";
import * as Schema from "effect/Schema";

export default Table.make(() =>
  Schema.Struct({
    caseId: Schema.String,
    position: Schema.Finite,
  }),
).index("by_caseId_position", ["caseId", "position"]);
