---
"@confect/server": major
---

Replace experimental `QueryStream.Element` tuples with a constructor accepting named `doc` and `key` fields.

To migrate custom annotated streams, construct elements with `new QueryStream.Element({ doc, key })` and replace tuple indexing or destructuring with `.doc`, `.key`, or object destructuring. Document streams and pagination results are unchanged.

**Before:**

```ts
const element = [Option.some(document), key] as const;
const [doc, orderKey] = element;
```

**After:**

```ts
import { QueryStream } from "@confect/server";

const element = new QueryStream.Element({ doc: Option.some(document), key });
const { doc, key: orderKey } = element;
```
