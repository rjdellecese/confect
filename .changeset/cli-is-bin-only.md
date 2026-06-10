---
"@confect/cli": patch
---

Package `@confect/cli` as a binary-only package: the `.` export—along with the `main`, `module`, and `types` fields—is removed, and no type declarations are published.

`@confect/cli` has no public API; its entry module is the `confect` bin script itself. The removed `.` export was both broken (it pointed at `./dist/index.js`, while the build emits `./dist/index.mjs`) and hazardous (importing the entry module would have executed the CLI, since the script runs at module top level). Nothing changes for the supported usage: running the `confect` binary.
