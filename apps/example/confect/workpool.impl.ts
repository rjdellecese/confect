import { FunctionImpl, GroupImpl } from "@confect/server";
import { Layer } from "effect";
import api from "./_generated/api";
import { backgroundWork, enqueue, onComplete, status } from "./workpool";

const enqueueImpl = FunctionImpl.make(api, "workpool", "enqueue", enqueue);
const statusImpl = FunctionImpl.make(api, "workpool", "status", status);
const backgroundWorkImpl = FunctionImpl.make(
  api,
  "workpool",
  "backgroundWork",
  backgroundWork,
);
const onCompleteImpl = FunctionImpl.make(
  api,
  "workpool",
  "onComplete",
  onComplete,
);

export const workpool = GroupImpl.make(api, "workpool").pipe(
  Layer.provide(enqueueImpl),
  Layer.provide(statusImpl),
  Layer.provide(backgroundWorkImpl),
  Layer.provide(onCompleteImpl),
);
