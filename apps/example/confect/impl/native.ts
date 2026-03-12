import { FunctionImpl, GroupImpl } from "@confect/server";
import { Layer } from "effect";
import api from "../_generated/api";
import { noteCount } from "../native/noteCount";

const noteCountImpl = FunctionImpl.make(api, "native", "noteCount", noteCount);

export const native = GroupImpl.make(api, "native").pipe(
  Layer.provide(noteCountImpl),
);
