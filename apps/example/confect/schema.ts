import { ConfectSchema } from "@rjdellecese/confect/server";
import { Note } from "./schema/note";
import { Tag } from "./schema/tag";
import { User } from "./schema/user";

export default ConfectSchema.defineConfectSchema(Note, User, Tag);
