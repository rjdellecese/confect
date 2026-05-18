import { Table } from "@gunta/confect-server";
import { Schema } from "effect";

export type Tags = {
  readonly name: string;
  readonly tags: readonly Tags[];
};

const TagSchema = Schema.Struct({
  name: Schema.String,
  tags: Schema.Array(Schema.suspend((): Schema.Schema<Tags> => TagSchema)),
});

export const Tags = Table.make("tags", TagSchema);
