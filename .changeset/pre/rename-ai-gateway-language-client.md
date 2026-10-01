---
"@confect/server": major
---

Rename `AiGatewayClient` to `AiGatewayLanguageClient` to distinguish language-model requests from `AiGatewayDecisionClient` requests.

To migrate, replace `AiGatewayClient` with `AiGatewayLanguageClient` in imports and references, including the `@confect/server/AiGatewayClient` subpath.

**Before:**

```ts
import { AiGatewayClient } from "@confect/server";
```

**After:**

```ts
import { AiGatewayLanguageClient } from "@confect/server";
```
