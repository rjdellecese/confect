---
"@confect/react": major
---

Replace Effect-native return types with Convex-equivalent return types in React hooks. `useQuery` now returns `T | undefined` instead of `Option<T>`. `useMutation` and `useAction` now return `(args) => Promise<T>` instead of `(args) => Effect<T>`. The hooks still encode args and decode return values via the spec's Effect Schemas automatically.
