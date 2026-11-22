import { defineSchema as defineSchema_ } from "convex/server";
import { Table as Table_ } from "@confect/server";

import notesTable from "./tables/notes";
import tagsTable from "./tables/tags";
import usersTable from "./tables/users";

/**
 * Convex schema containing the validators and indexes for every application table.
 * Use it for deployment or pass it to the test backend.
 *
 * **Gotchas**
 *
 * Importing this module constructs every table's deployment definition. Import
 * individual handles from `_generated/tables` in function implementations.
 *
 * @category schemas
 */
export default defineSchema_({
  notes: Table_.tableDefinition(notesTable),
  tags: Table_.tableDefinition(tagsTable),
  users: Table_.tableDefinition(usersTable),
});
