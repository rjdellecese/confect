import type { Document } from "@confect/server";
import type schemaDefinition from "./schema";

/** Decoded events document, including _id and _creationTime. */
export type EventsDoc = Document.Document<typeof schemaDefinition, "events">;
/** Decoded notes document, including _id and _creationTime. */
export type NotesDoc = Document.Document<typeof schemaDefinition, "notes">;
/** Decoded tags document, including _id and _creationTime. */
export type TagsDoc = Document.Document<typeof schemaDefinition, "tags">;
/** Decoded users document, including _id and _creationTime. */
export type UsersDoc = Document.Document<typeof schemaDefinition, "users">;

/** Application table names mapped to decoded document types used by database services; excludes system tables. */
export interface Docs {
  events: EventsDoc;
  notes: NotesDoc;
  tags: TagsDoc;
  users: UsersDoc;
}
