---
"@confect/server": patch
---

`DatabaseWriter`'s `patch` reads the document once, as Convex's `patch` does, for tables whose schema is a struct with no struct-level checks and no transformations or declarations in any field. Such a patch no longer re-checks or rewrites the fields it leaves alone: a document that fails to decode can now be patched, and keys that decoding drops are kept.
