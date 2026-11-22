import type { Document } from "@confect/server";
import type schemaDefinition from "./schema";

/**
 * Decoded document from `events`, including the system fields `_id` and
 * `_creationTime`.
 *
 * @category models
 */
export type EventsDoc = Document.Document<typeof schemaDefinition, "events">;
/**
 * Decoded document from `notes`, including the system fields `_id` and
 * `_creationTime`.
 *
 * @category models
 */
export type NotesDoc = Document.Document<typeof schemaDefinition, "notes">;
/**
 * Decoded document from `tags`, including the system fields `_id` and
 * `_creationTime`.
 *
 * @category models
 */
export type TagsDoc = Document.Document<typeof schemaDefinition, "tags">;
/**
 * Decoded document from `users`, including the system fields `_id` and
 * `_creationTime`.
 *
 * @category models
 */
export type UsersDoc = Document.Document<typeof schemaDefinition, "users">;

/**
 * Map from application table names to the decoded document types returned by the
 * database services. System tables are not included.
 *
 * @category models
 */
export interface Docs {
  events: EventsDoc;
  notes: NotesDoc;
  tags: TagsDoc;
  users: UsersDoc;
}
