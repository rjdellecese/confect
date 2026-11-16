/**
 * Names of the application's declared tables, excluding Convex system tables.
 * Use this list in test setup or when you need table names without importing their schemas.
 * @category Models
 */
export default ["events", "notes", "tags", "users"] as const;
