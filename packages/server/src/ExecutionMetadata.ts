import type { QueryMeta } from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export type { DeploymentMetadata, FunctionMetadata } from "convex/server";

const make = (
  meta: Pick<QueryMeta, "getFunctionMetadata" | "getDeploymentMetadata">,
) => ({
  getFunction: Effect.fn("ExecutionMetadata.getFunction")(() =>
    Effect.promise(() => meta.getFunctionMetadata()),
  ),
  getDeployment: Effect.fn("ExecutionMetadata.getDeployment")(() =>
    Effect.promise(() => meta.getDeploymentMetadata()),
  ),
});

export class ExecutionMetadata extends Context.Service<
  ExecutionMetadata,
  ReturnType<typeof make>
>()("@confect/server/ExecutionMetadata") {}

export const layer = (
  meta: Pick<QueryMeta, "getFunctionMetadata" | "getDeploymentMetadata">,
) => Layer.succeed(ExecutionMetadata, make(meta));
