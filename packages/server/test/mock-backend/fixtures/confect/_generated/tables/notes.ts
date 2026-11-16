import unnamed from "../../tables/notes";

/**
 * Named table definition for notes, including its indexes and lazy Fields and Doc schemas.
 * Doc includes _id and _creationTime; Fields describes the user-defined fields.
 * Importing this wrapper binds the table name without evaluating its field-schema callback.
 */
export default unnamed("notes");
