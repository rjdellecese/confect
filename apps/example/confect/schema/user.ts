import { ConfectSchema } from "@rjdellecese/confect/server";
import { Schema } from "effect";

export const User = ConfectSchema.defineConfectTable(
  Schema.Struct({
    username: Schema.String,
  })
);
