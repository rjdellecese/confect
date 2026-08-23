import { MiddlewareSpec } from "@confect/core";

/** Inserts a `"first"` marker note before running the rest of the chain. */
export default class RecordFirst extends MiddlewareSpec.MiddlewareSpec<RecordFirst>()(
  "RecordFirst",
  { functionTypes: { query: false, mutation: true, action: false } },
) {}
