---
"@confect/cli": patch
---

Fix `confect codegen` generating broken registry import paths for Node function groups on a clean tree.

When codegen ran against a project with no previously-generated `convex/` modules on disk, every Node-runtime function group took the "new group" code path, which left the leading `node` segment in the registry import specifier. The generated `convex/node/<name>.ts` modules imported `../../confect/_generated/registeredFunctions/node/<name>`, but the registry files are actually written without the `node/` segment, at `confect/_generated/registeredFunctions/<name>`. This broke any from-scratch regeneration (for example, CI that regenerates the codegen artifact on a clean checkout), surfacing as `convex codegen` failing to resolve the import. Incremental runs were unaffected because the already-on-disk modules took a different, correct code path.

Both the new-group and overlapping-group branches now compute the registry path through a single shared helper that strips the leading `node` segment, matching how the registry files are emitted, so the two can no longer drift apart.
