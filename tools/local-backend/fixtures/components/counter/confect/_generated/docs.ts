import type { Document } from "@confect/server";
import type schemaDefinition from "./schema";

/**
 * Decoded document from `counters`, including the system fields `_id` and
 * `_creationTime`.
 *
 * @category models
 */
export type CountersDoc = Document.Document<typeof schemaDefinition, "counters">;

/**
 * Map from component table names to the decoded document types returned by the
 * database services. System tables are not included.
 *
 * @category models
 */
export interface Docs {
  counters: CountersDoc;
}
