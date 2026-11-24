# Examples

Examples are optional. Keep or add one only for behavior not evident from the
signature, meaningful composition, or useful inference or narrowing. Replace
or remove examples that are trivial, misleading, contrived, or
scaffolding-heavy.

Use `**Example** (Unique use-case title)`, a blank line, and exactly one
non-empty plain `ts` fence. Titles must remain unique after trimming and lowercasing.

Run `pnpm build && pnpm check:examples` to typecheck examples with `tsrs`.
The check does not execute examples. Additionally:

- Use public imports and arrange nontrivial examples as setup, operation, then
  semantic observation.
- When demonstrating execution, prefer awaited `Effect.runPromise`; use
  `Effect.runSync` only when synchronous execution is the documented contract.
- Keep type-level examples free of tautological runtime assertions.
- Use `Ref`, `Deferred`, or `Queue` rather than mutable probes for concurrency,
  interruption, or races.

If example research suggests an implementation or type bug, report it instead
of changing runtime code during a documentation-only pass.
