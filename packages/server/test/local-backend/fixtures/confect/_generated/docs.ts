import type { Document } from "@confect/server";
import type schemaDefinition from "./schema";

export type OrderedRowsDoc = Document.Document<typeof schemaDefinition, "orderedRows">;
export type TransactionNotesDoc = Document.Document<typeof schemaDefinition, "transactionNotes">;

export interface Docs {
  orderedRows: OrderedRowsDoc;
  transactionNotes: TransactionNotesDoc;
}
