import { Table } from "@confect/server";
import * as Schema from "effect/Schema";

// Exported (as a type only — there is no `Tags` value export here) so the
// default export's inferred type can name this recursive alias. The
// codegen discovery contract is "one Table per file, exposed as the
// default export"; type-only aliases used internally do not violate it.
export type Tags = {
  readonly name: string;
  readonly tags: readonly Tags[];
};

const TagSchema = Schema.Struct({
  name: Schema.String,
  tags: Schema.Array(Schema.suspend((): Schema.Schema<Tags> => TagSchema)),
});

export default Table.make(() => TagSchema);
