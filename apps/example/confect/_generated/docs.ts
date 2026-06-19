import type { Document } from "@confect/server";
import type schemaDefinition from "./schema";

export interface NotesDoc extends Document.Document<typeof schemaDefinition, "notes"> {}
export interface TagsDoc extends Document.Document<typeof schemaDefinition, "tags"> {}
export interface UsersDoc extends Document.Document<typeof schemaDefinition, "users"> {}

export interface ConfectDocs {
  notes: NotesDoc;
  tags: TagsDoc;
  users: UsersDoc;
}
