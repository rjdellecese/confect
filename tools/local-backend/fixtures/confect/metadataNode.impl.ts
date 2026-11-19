import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl, GroupImpl } from "./_generated/server";
import { ExecutionMetadata, RequestMetadata } from "./_generated/services";
import metadataNode from "./metadataNode.spec";

const metadata = FunctionImpl.make(metadataNode, "metadata", () =>
  Effect.gen(function* () {
    const execution = yield* ExecutionMetadata;
    const request = yield* RequestMetadata;
    const fn = yield* execution.getFunction();
    const deployment = yield* execution.getDeployment();
    const info = yield* request.get();
    return {
      functionName: fn.name,
      functionType: fn.type,
      deploymentName: deployment.name,
      requestId: info.requestId,
      ip: info.ip,
      scheduledFunctionId: info.scheduledFunctionId,
    };
  }),
);

export default GroupImpl.make(metadataNode).pipe(
  Layer.provide(metadata),
  GroupImpl.finalize,
);
