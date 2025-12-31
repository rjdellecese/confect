import { ConfectSchema } from "@rjdellecese/confect";
import { Note } from "./tables/note";
import { Tag } from "./tables/tag";
import { User } from "./tables/user";

export default ConfectSchema.make().addTable(Note).addTable(User).addTable(Tag);
