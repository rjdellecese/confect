import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Layer from "effect/Layer";
import type databaseSchema from "./_generated/schema";
import { backgroundWork, enqueue, onComplete, status } from "./workpool";
import workpool from "./workpool.spec";

const makeFunction = FunctionImpl.forSchema<typeof databaseSchema>();

const enqueueImpl = makeFunction(workpool, "enqueue", enqueue);
const statusImpl = makeFunction(workpool, "status", status);
const backgroundWorkImpl = makeFunction(
  workpool,
  "backgroundWork",
  backgroundWork,
);
const onCompleteImpl = makeFunction(workpool, "onComplete", onComplete);

export default GroupImpl.fromSpec(workpool).pipe(
  Layer.provide(enqueueImpl),
  Layer.provide(statusImpl),
  Layer.provide(backgroundWorkImpl),
  Layer.provide(onCompleteImpl),
  GroupImpl.finalize,
);
