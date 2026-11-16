import usersTable from "../../tables/users";

/**
 * Table handle for users. Pass it to reader.table or writer.table to select this table.
 * Fields describes the user-defined fields; Doc also includes _id and _creationTime.
 * Importing the handle does not evaluate its field-schema callback.
 * @category Schemas
 */
export default usersTable("users");
