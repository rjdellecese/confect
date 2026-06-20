import { Table } from "@confect/server";
import * as Schema from "effect/Schema";

export default Table.make(() =>
  Schema.Union(
    Schema.Struct({ kind: Schema.Literal("a"), a: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("b"), b: Schema.Number }),
  ),
);
