import { MiddlewareSpec } from "@confect/core";

/** Inserts a `"second"` marker note before running the rest of the chain. */
export default class RecordSecond extends MiddlewareSpec.Service<RecordSecond>()(
  "RecordSecond",
  { functionTypes: { query: false, mutation: true, action: false } },
) {}
