---
"@confect/cli": major
---

Evaluate project modules in disposable worker threads during `confect codegen` and `confect dev`.

### Breaking Changes

- Top-level code evaluated during generation or validation can no longer call `process.chdir()` or other Node APIs unavailable in workers. Use explicit paths instead of changing the working directory.
- Native addons loaded during evaluation must support worker contexts. Legacy addons shared with the CLI process can fail to load.
- Evaluators no longer have separate OS-process crash or memory-exhaustion isolation from the CLI.

Each evaluation still imports modules into a fresh JavaScript environment and waits for its worker to terminate before returning. Ordinary evaluation failures and interruptions remain recoverable; user output and underlying transport-error diagnostics are preserved.
