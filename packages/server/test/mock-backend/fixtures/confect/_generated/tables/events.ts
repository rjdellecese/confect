import eventsTable from "../../tables/events";

/**
 * Table handle for `events`. Pass it to `reader.table` or `writer.table` to
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
export default eventsTable("events");
