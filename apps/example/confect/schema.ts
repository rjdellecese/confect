import { ConfectSchema } from "@rjdellecese/confect";
import { Note } from "./schema/note";
import { Tag } from "./schema/tag";
import { User } from "./schema/user";

export default ConfectSchema.make().addTable(Note).addTable(User).addTable(Tag);
