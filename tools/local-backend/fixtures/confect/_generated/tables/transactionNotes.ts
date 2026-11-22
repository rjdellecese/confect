import transactionNotesTable from "../../tables/transactionNotes";

/**
 * Table handle for `transactionNotes`. Pass it to `reader.table` or `writer.table` to
 * select this table without loading other application tables.
 *
 * **Details**
 *
 * `Fields` describes the user-defined fields; `Doc` also includes `_id` and
 * `_creationTime`. Importing the handle does not evaluate its field-schema
 * callback.
 *
 * @category schemas
 */
export default transactionNotesTable("transactionNotes");
