import * as Layer from "effect/Layer";
import { FunctionImpl, GroupImpl } from "./_generated/server";
import { backgroundWork, enqueue, onComplete, status } from "./workpool";
import workpoolSpec from "./workpool.spec";

const enqueueImpl = FunctionImpl.make(workpoolSpec, "enqueue", enqueue);
const statusImpl = FunctionImpl.make(workpoolSpec, "status", status);
const backgroundWorkImpl = FunctionImpl.make(
  workpoolSpec,
  "backgroundWork",
  backgroundWork,
);
const onCompleteImpl = FunctionImpl.make(
  workpoolSpec,
  "onComplete",
  onComplete,
);

export default GroupImpl.make(workpoolSpec).pipe(
  Layer.provide(enqueueImpl),
  Layer.provide(statusImpl),
  Layer.provide(backgroundWorkImpl),
  Layer.provide(onCompleteImpl),
  GroupImpl.finalize,
);
