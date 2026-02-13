---
"@confect/server": patch
---

Refactor `DatabaseWriter` API to match `DatabaseReader` (`writer.insert("notes", { text })` becomes `writer.table("notes").insert({ text })`, and so on)
