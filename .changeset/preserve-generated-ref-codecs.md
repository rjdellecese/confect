---
"@confect/core": patch
---

Preserve the declared return and error codecs on generated function refs. Encoding a result retains its wire type, and decoding with the ref’s own error codec yields only the function’s error, not middleware errors.
