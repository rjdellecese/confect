import { Table } from "@confect/server";
import * as Schema from "effect/Schema";

// A table whose document type is a discriminated union rather than a single
// object. Its generated `EventsDoc` must be emitted as a `type` alias — an
// `interface … extends Document.Document<…>` cannot extend a union (TS2312).
export default Table.make(() =>
  Schema.Union(
    Schema.Struct({ kind: Schema.Literal("a"), a: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("b"), b: Schema.Number }),
  ),
);
