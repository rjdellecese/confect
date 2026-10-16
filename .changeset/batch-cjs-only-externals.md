---
"@confect/cli": patch
---

Keep `confect codegen` and `confect dev` on their shared build when an application imports a package subpath that only CommonJS resolution can find, such as `next/headers` from a package without `exports`. The shared build previously failed on such an import, and every group then fell back to its own build, which made full generation many times slower in large applications.
