/**
 * Deployment schema that the Convex CLI and `convex-test` read from
 * `convex/schema.ts`.
 *
 * **Gotchas**
 *
 * Importing this schema constructs validators for every application table. Keep it
 * out of function runtime code.
 *
 * @category schemas
 */
export { default } from "../confect/_generated/convexSchema";
