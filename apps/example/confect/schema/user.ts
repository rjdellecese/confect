import { ConfectSchema } from "@rjdellecese/confect/server";
import { Schema } from "effect";

export const User = ConfectSchema.defineConfectTable({
  name: "users",
  fields: Schema.Struct({
    username: Schema.String,
  }),
});
