import { Schema } from "effect";
import { Table } from "../../../src/index";

export type Tags = {
  readonly name: string;
  readonly tags: readonly Tags[];
};

const TagSchema = Schema.Struct({
  name: Schema.String,
  tags: Schema.Array(Schema.suspend((): Schema.Schema<Tags> => TagSchema)),
});

export const Tags = Table.make("tags", TagSchema);
