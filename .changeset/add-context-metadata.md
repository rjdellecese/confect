---
"@confect/server": minor
"@confect/cli": minor
---

Add `ExecutionMetadata`, `RequestMetadata`, and `Transaction` services for reading function and deployment metadata, request metadata, and current transaction metrics. Generated services expose each capability to the function contexts that support it, including middleware and HTTP handlers where applicable.

```ts
import * as Effect from "effect/Effect";
import { ExecutionMetadata, Transaction } from "./_generated/services";

const queryDetails = Effect.gen(function* () {
  const execution = yield* ExecutionMetadata;
  const transaction = yield* Transaction;
  const fn = yield* execution.getFunction();
  const metrics = yield* transaction.getMetrics();

  return {
    functionName: fn.name,
    remainingReads: metrics.documentsRead.remaining,
  };
});
```
