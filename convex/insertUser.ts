import { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";

export default mutation({
  args: {},
  handler: async ({ db }): Promise<Id<"users">> =>
    db.insert("users", { name: "John Doe" }),
});
