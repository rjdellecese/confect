import { ConfectSchema } from "@rjdellecese/confect";
import { Schema } from "effect";

type Tag = {
  readonly name: string;
  readonly tags: readonly Tag[];
};

const TagSchema = Schema.Struct({
  name: Schema.String,
  tags: Schema.Array(Schema.suspend((): Schema.Schema<Tag> => TagSchema)),
});

export const Tag = ConfectSchema.defineConfectTable({
  name: "tags",
  fields: TagSchema,
});
