import { GroupImpl } from "@confect/server";
import * as Layer from "effect/Layer";
import { FunctionImpl } from "./_generated/server";
import { backgroundWork, enqueue, onComplete, status } from "./workpool";
import workpool from "./workpool.spec";

const enqueueImpl = FunctionImpl.make(workpool, "enqueue", enqueue);
const statusImpl = FunctionImpl.make(workpool, "status", status);
const backgroundWorkImpl = FunctionImpl.make(
  workpool,
  "backgroundWork",
  backgroundWork,
);
const onCompleteImpl = FunctionImpl.make(workpool, "onComplete", onComplete);

export default GroupImpl.make(workpool).pipe(
  Layer.provide(enqueueImpl),
  Layer.provide(statusImpl),
  Layer.provide(backgroundWorkImpl),
  Layer.provide(onCompleteImpl),
  GroupImpl.finalize,
);
