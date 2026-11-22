import type { Document } from "@confect/server";
import type schemaDefinition from "./schema";

/**
 * Decoded document from `httpVectors`, including the system fields `_id` and
 * `_creationTime`.
 *
 * @category models
 */
export type HttpVectorsDoc = Document.Document<typeof schemaDefinition, "httpVectors">;
/**
 * Decoded document from `transactionNotes`, including the system fields `_id` and
 * `_creationTime`.
 *
 * @category models
 */
export type TransactionNotesDoc = Document.Document<typeof schemaDefinition, "transactionNotes">;

/**
 * Map from application table names to the decoded document types returned by the
 * database services. System tables are not included.
 *
 * @category models
 */
export interface Docs {
  httpVectors: HttpVectorsDoc;
  transactionNotes: TransactionNotesDoc;
}
