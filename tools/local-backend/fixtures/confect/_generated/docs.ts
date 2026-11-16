import type { Document } from "@confect/server";
import type schemaDefinition from "./schema";

/**
 * Decoded httpVectors document, including _id and _creationTime.
 * @category Models
 */
export type HttpVectorsDoc = Document.Document<typeof schemaDefinition, "httpVectors">;
/**
 * Decoded transactionNotes document, including _id and _creationTime.
 * @category Models
 */
export type TransactionNotesDoc = Document.Document<typeof schemaDefinition, "transactionNotes">;

/**
 * Application table names mapped to decoded document types used by database services; excludes system tables.
 * @category Models
 */
export interface Docs {
  httpVectors: HttpVectorsDoc;
  transactionNotes: TransactionNotesDoc;
}
