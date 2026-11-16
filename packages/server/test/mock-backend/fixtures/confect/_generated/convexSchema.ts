import { defineSchema as $defineSchema } from "convex/server";
import { Table as $Table } from "@confect/server";

import events from "./tables/events";
import notes from "./tables/notes";
import tags from "./tables/tags";
import users from "./tables/users";

/**
 * Convex validators and indexes for deployment and convex-test setup.
 * Importing this module constructs every table's deployment definition.
 * Use the runtime schema module in function implementations instead.
 * @category Deployment
 */
export default $defineSchema({
  events: $Table.tableDefinition(events),
  notes: $Table.tableDefinition(notes),
  tags: $Table.tableDefinition(tags),
  users: $Table.tableDefinition(users),
});
