/**
 * Deployment schema that the Convex CLI and `convex-test` read from
 * `convex/schema.ts`.
 *
 * **Gotchas**
 *
 * Importing this schema constructs validators for every component table. Keep
 * it out of function runtime code.
 *
 * @category Schemas
 */
export { default } from "../confect/_generated/convexSchema";
