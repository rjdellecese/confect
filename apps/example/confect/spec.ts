import { Spec } from "@confect/core";
import { env } from "./spec/env";
import { notesAndRandom } from "./spec/notesAndRandom";
import { workpool } from "./spec/workpool";

export default Spec.make().add(env).add(notesAndRandom).add(workpool);
