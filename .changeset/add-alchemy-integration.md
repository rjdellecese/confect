---
"@confect/alchemy": minor
---

Add `@confect/alchemy` to provision Convex cloud resources and deploy applications in Alchemy stacks. Use `Convex` resources for projects, deployments, deploy keys, environment variables, and plain Convex code, or `Confect.Backend` to run Confect codegen before deployment. Projects and deployments are retained by default.

Use `Confect.Backend`'s `env` option to adopt and restore readable values. Declare a `Convex.AuthoritativeEnvironmentVariable` to create or overwrite a single name without reading its previous value. The value is retained on removal unless you opt into destruction.

The integration requires Alchemy `2.0.0-beta.85` and stable Effect `^4.1.0`. On Node.js, install `@effect/platform-node` in the stack workspace and use Node.js 24.11.1 or later on 24.x, or 25.1.0 or later.
