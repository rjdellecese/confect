import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Layer from "effect/Layer";
import databaseSchema from "./_generated/schema";
import { backgroundWork, enqueue, onComplete, status } from "./workpool";
import workpool from "./workpool.spec";

const enqueueImpl = FunctionImpl.make(
  databaseSchema,
  workpool,
  "enqueue",
  enqueue,
);
const statusImpl = FunctionImpl.make(
  databaseSchema,
  workpool,
  "status",
  status,
);
const backgroundWorkImpl = FunctionImpl.make(
  databaseSchema,
  workpool,
  "backgroundWork",
  backgroundWork,
);
const onCompleteImpl = FunctionImpl.make(
  databaseSchema,
  workpool,
  "onComplete",
  onComplete,
);

export default GroupImpl.make(databaseSchema, workpool).pipe(
  Layer.provide(enqueueImpl),
  Layer.provide(statusImpl),
  Layer.provide(backgroundWorkImpl),
  Layer.provide(onCompleteImpl),
  GroupImpl.finalize,
);
