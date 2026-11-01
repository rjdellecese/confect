import type { Document } from "@confect/server";
import type schemaDefinition from "./schema";

export type TransactionNotesDoc = Document.Document<typeof schemaDefinition, "transactionNotes">;

export interface Docs {
  transactionNotes: TransactionNotesDoc;
}
