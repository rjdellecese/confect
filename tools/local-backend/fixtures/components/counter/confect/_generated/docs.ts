import type { Document } from "@confect/server";
import type schemaDefinition from "./schema";

export type CountersDoc = Document.Document<typeof schemaDefinition, "counters">;

export interface Docs {
  counters: CountersDoc;
}
