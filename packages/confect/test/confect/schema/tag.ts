import { ConfectTable } from "@rjdellecese/confect";
import { Schema } from "effect";

export type Tag = {
  readonly name: string;
  readonly tags: readonly Tag[];
};

const TagSchema = Schema.Struct({
  name: Schema.String,
  tags: Schema.Array(Schema.suspend((): Schema.Schema<Tag> => TagSchema)),
});

export const Tag = ConfectTable.make({
  name: "tags",
  fields: TagSchema,
});
