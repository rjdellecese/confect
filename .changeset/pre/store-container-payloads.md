---
"@confect/core": major
"@confect/server": major
"@confect/cli": patch
---

Use `Spec.groups(spec)` and `DatabaseSchema.tables(schema)` to inspect assembled group and table records. Adding a group at an existing spec name now replaces its inferred type as well as its runtime value.

### Breaking Changes

- The `Spec.groups` and `DatabaseSchema.tables` accessors replace the corresponding instance properties.
- `Spec.Spec`, `DatabaseSchema.DatabaseSchema`, and `DataModel.DataModel` take a record type instead of a union of its members. The separate `~Groups` and `~Tables` phantom properties on these containers are removed; the `Groups` and `Tables` type helpers remain available.

Run `confect codegen` to update generated spec and schema annotations. Ordinary `Spec.make().add(...)`, `Spec.make().addAt(...)`, and `DatabaseSchema.make({ ... })` calls keep their existing syntax. `DataModel.FromTables` continues to accept a table union.

For handwritten annotations, use `Spec.Spec<{ readonly notes: typeof notesGroup }>` or `DatabaseSchema.DatabaseSchema<{ readonly notes: typeof notesTable }>` in place of the corresponding member-union parameter.
