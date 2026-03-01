import { Spec } from "@confect/core";
import { env } from "./spec/env";
import { notesAndRandom } from "./spec/notesAndRandom";

export default Spec.make().add(env).add(notesAndRandom);
