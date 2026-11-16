import unnamed from "../../tables/events";

/**
 * Named table definition for events, including its indexes and lazy Fields and Doc schemas.
 * Doc includes _id and _creationTime; Fields describes the user-defined fields.
 * Importing this wrapper binds the table name without evaluating its field-schema callback.
 * @category Schemas
 */
export default unnamed("events");
