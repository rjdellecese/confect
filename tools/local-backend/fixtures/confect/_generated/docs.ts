import type { Document } from "@confect/server";
import type schemaDefinition from "./schema";

/** Decoded httpVectors document, including _id and _creationTime. */
export type HttpVectorsDoc = Document.Document<typeof schemaDefinition, "httpVectors">;
/** Decoded transactionNotes document, including _id and _creationTime. */
export type TransactionNotesDoc = Document.Document<typeof schemaDefinition, "transactionNotes">;

/** Application table names mapped to decoded document types used by database services; excludes system tables. */
export interface Docs {
  httpVectors: HttpVectorsDoc;
  transactionNotes: TransactionNotesDoc;
}
