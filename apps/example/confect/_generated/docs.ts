import type { Confect } from "@confect/server";
import type schemaDefinition from "./schema";

export interface notes extends Confect.Doc<typeof schemaDefinition, "notes"> {}
export interface tags extends Confect.Doc<typeof schemaDefinition, "tags"> {}
export interface users extends Confect.Doc<typeof schemaDefinition, "users"> {}

export interface ConfectDocs {
  notes: notes;
  tags: tags;
  users: users;
}
