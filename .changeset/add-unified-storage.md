---
"@confect/server": minor
"@confect/cli": minor
---

Add a unified `Storage` service, available from generated services, for retrieving download URLs, generating upload URLs, deleting files, and reading or storing blobs. Each operation retains its existing context restrictions, and the previous storage services remain available for compatibility.

```ts
import * as Effect from "effect/Effect";
import { Storage } from "./_generated/services";

const uploadUrl = Effect.gen(function* () {
  const storage = yield* Storage;
  return yield* storage.generateUploadUrl;
});
```
