import { Spec } from "@confect/core";
import { env } from "./spec/env";
import { native } from "./spec/native";
import { notesAndRandom } from "./spec/notesAndRandom";

export default Spec.make().add(env).add(native).add(notesAndRandom);
