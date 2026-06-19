import type { Document } from "@confect/server";
import type schemaDefinition from "./schema";

export interface notes extends Document.Document<typeof schemaDefinition, "notes"> {}
export interface tags extends Document.Document<typeof schemaDefinition, "tags"> {}
export interface users extends Document.Document<typeof schemaDefinition, "users"> {}

export interface ConfectDocs {
  notes: notes;
  tags: tags;
  users: users;
}
