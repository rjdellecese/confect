import { ConfectApiSpec } from "@rjdellecese/confect/api";
import Notes from "./spec/notes";
import Random from "./spec/random";

export default ConfectApiSpec.make("api").add(Notes).add(Random);
