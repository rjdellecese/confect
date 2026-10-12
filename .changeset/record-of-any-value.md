---
"@confect/core": patch
---

Type a record of `Schema.Any` with a required value validator. `Schema.Record(Schema.String, Schema.Any)` compiled to `v.record(v.string(), v.any())` at runtime, but its type carried an optional `VAny` value, which `VRecord` does not accept, so a table with such a field could not be passed to `Table.tableDefinition`.
