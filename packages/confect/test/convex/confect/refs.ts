import { Refs } from "@rjdellecese/confect";
import spec from "../../confect/spec";

const refs = Refs.make(spec);

export const api = Refs.justPublic(refs);
export const internal = Refs.justInternal(refs);
