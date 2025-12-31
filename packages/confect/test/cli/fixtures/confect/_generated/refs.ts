import { ConfectApiRefs } from "@rjdellecese/confect";
import spec from "../spec";

const refs = ConfectApiRefs.make(spec);

export const api = ConfectApiRefs.justPublic(refs);
export const internal = ConfectApiRefs.justInternal(refs);
