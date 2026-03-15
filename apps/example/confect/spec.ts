import { Spec } from "@confect/core";
import { env } from "./env.spec";
import { notesAndRandom } from "./notesAndRandom.spec";
import { workpool } from "./workpool.spec";

export default Spec.make().add(env).add(notesAndRandom).add(workpool);
