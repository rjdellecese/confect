import type { Document } from "@confect/server";
import type schemaDefinition from "./schema";

export type EventsDoc = Document.Document<typeof schemaDefinition, "events">;
export type NotesDoc = Document.Document<typeof schemaDefinition, "notes">;
export type TagsDoc = Document.Document<typeof schemaDefinition, "tags">;
export type UsersDoc = Document.Document<typeof schemaDefinition, "users">;

export interface Docs {
  events: EventsDoc;
  notes: NotesDoc;
  tags: TagsDoc;
  users: UsersDoc;
}
