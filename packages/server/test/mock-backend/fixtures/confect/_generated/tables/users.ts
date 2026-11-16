import unnamed from "../../tables/users";

/**
 * Named table definition for users, including its indexes and lazy Fields and Doc schemas.
 * Doc includes _id and _creationTime; Fields describes the user-defined fields.
 * Importing this wrapper binds the table name without evaluating its field-schema callback.
 */
export default unnamed("users");
