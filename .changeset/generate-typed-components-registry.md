---
"@confect/cli": minor
---

Generate a typed Convex components registry at `confect/_generated/components.ts`

`confect codegen` and `confect dev` now evaluate `convex/convex.config.ts` and generate a typed `components` registry with one entry per installed component (`app.use(...)`). Import it from anywhere in your `confect/` directory to pass typed component references to component clients:

```ts
import { components } from "./_generated/components";

const pool = new Workpool(components.workpool, { maxParallelism: 3 });
```

Previously the only typed registry was the `components` export of `convex/_generated/api`, which cannot be imported from a Confect impl's import graph: `confect codegen` bundles and evaluates each impl, and `convex/_generated/api` doesn't exist yet at that point (Convex generates it from the `convex/` modules Confect codegen itself produces). The workaround — `componentsGeneric().workpool as unknown as ComponentApi` — required an unsafe cast at every call site.

Each entry is typed with the `ComponentApi` type that component packages export from `_generated/component.js` (the convention Convex's own codegen uses), so no cast is needed. Components installed from npm are typed via their package specifier; locally-defined components are typed via a relative path. Edits to `convex.config.ts` re-run codegen in `confect dev`.
