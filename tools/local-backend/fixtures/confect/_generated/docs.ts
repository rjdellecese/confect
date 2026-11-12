import type { Document } from "@confect/server";
import type schemaDefinition from "./schema";

export type FilterNotesDoc = Document.Document<typeof schemaDefinition, "filterNotes">;
export type HttpVectorsDoc = Document.Document<typeof schemaDefinition, "httpVectors">;
export type TransactionNotesDoc = Document.Document<typeof schemaDefinition, "transactionNotes">;

export interface Docs {
  filterNotes: FilterNotesDoc;
  httpVectors: HttpVectorsDoc;
  transactionNotes: TransactionNotesDoc;
}
