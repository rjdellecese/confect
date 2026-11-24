import countersTable from "../../tables/counters";
import { scope } from "../id";

/**
 * Table handle for `counters`. Pass it to `reader.table` or `writer.table` to
 * select this table without loading other component tables.
 *
 * **Details**
 *
 * `Fields` describes the user-defined fields; `Doc` also includes `_id` and
 * `_creationTime`. Importing the handle does not evaluate its field-schema
 * callback.
 *
 * @category schemas
 */
export default countersTable("counters", scope);
