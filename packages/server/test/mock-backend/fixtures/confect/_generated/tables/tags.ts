import tagsTable from "../../tables/tags";

/**
 * Table handle for tags. Pass it to reader.table or writer.table to select this table.
 * Fields describes the user-defined fields; Doc also includes _id and _creationTime.
 * Importing the handle does not evaluate its field-schema callback.
 * @category Schemas
 */
export default tagsTable("tags");
