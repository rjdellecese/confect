import { DatabaseSchema } from "../../src/index";
import { Notes } from "./tables/Notes";
import { Tags } from "./tables/Tags";
import { Users } from "./tables/Users";

export default DatabaseSchema.make()
  .addTable(Notes)
  .addTable(Users)
  .addTable(Tags);
