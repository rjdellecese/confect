import { Refs } from "@confect/core";
import spec from "../spec";

const refs = Refs.make(spec);

export const api = Refs.justPublic(refs);
export const internal = Refs.justInternal(refs);
