import * as Layer from "effect/Layer";
import { FunctionImpl, GroupImpl } from "../_generated/server";
import { paginate, paginateTwice, roundTrip } from "./nativeComponents";
import spec from "./nativeComponents.spec";

export default GroupImpl.make(spec).pipe(
  Layer.provide([
    FunctionImpl.make(spec, "roundTrip", roundTrip),
    FunctionImpl.make(spec, "paginate", paginate),
    FunctionImpl.make(spec, "paginateTwice", paginateTwice),
  ]),
  GroupImpl.finalize,
);
