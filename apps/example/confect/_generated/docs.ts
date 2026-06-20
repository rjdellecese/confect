import type { Document } from "@confect/server";
import type schemaDefinition from "./schema";

export type NotesDoc = Document.Document<typeof schemaDefinition, "notes">;
export type TagsDoc = Document.Document<typeof schemaDefinition, "tags">;
export type UsersDoc = Document.Document<typeof schemaDefinition, "users">;

export interface Docs {
  notes: NotesDoc;
  tags: TagsDoc;
  users: UsersDoc;
}
