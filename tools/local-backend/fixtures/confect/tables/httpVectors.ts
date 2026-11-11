import { Table } from "@confect/core";
import * as Schema from "effect/Schema";

export default Table.make(() =>
  Schema.Struct({
    caseId: Schema.String,
    embedding: Schema.Array(Schema.Finite),
  }),
).vectorIndex("embedding", {
  vectorField: "embedding",
  filterFields: ["caseId"],
  dimensions: 3,
});
