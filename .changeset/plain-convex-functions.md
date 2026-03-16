---
"@confect/core": minor
"@confect/server": minor
"@confect/react": minor
"@confect/test": minor
"@confect/cli": minor
---

Add support for plain Convex functions. Plain Convex queries, mutations, and actions can now be included in your Confect spec and impl tree using new `FunctionSpec.convexPublic*` and `FunctionSpec.convexInternal*` constructors. This enables interop with Convex components and libraries (such as Workpool, Workflow, Migrations, and Better Auth) that require user-defined or -provided Convex functions.
