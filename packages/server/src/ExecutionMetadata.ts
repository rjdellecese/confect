import type { QueryMeta } from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

/**
 * Native Convex metadata describing the running function and its deployment,
 * returned by `getFunction` and `getDeployment` respectively.
 *
 * @category Models
 */
export type { DeploymentMetadata, FunctionMetadata } from "convex/server";

const make = (
  meta: Pick<QueryMeta, "getFunctionMetadata" | "getDeploymentMetadata">,
) => ({
  /**
   * Reads the current function's name, component path, type, and visibility.
   *
   * @category Getters
   *
   * @returns An Effect producing native `FunctionMetadata`. A Convex rejection
   *   is a defect.
   */
  getFunction: Effect.fn("ExecutionMetadata.getFunction")(() =>
    Effect.promise(() => meta.getFunctionMetadata()),
  ),
  /**
   * Reads the name, region, and class of the deployment running the function.
   *
   * @category Getters
   *
   * @returns An Effect producing native `DeploymentMetadata`. A Convex
   *   rejection is a defect.
   */
  getDeployment: Effect.fn("ExecutionMetadata.getDeployment")(() =>
    Effect.promise(() => meta.getDeploymentMetadata()),
  ),
});

/**
 * Tag for the service that identifies the running function and deployment.
 * Yield the generated `ExecutionMetadata` tag in a query, mutation, action, or
 * HTTP handler to read the native metadata.
 *
 * @category Tags
 */
export class ExecutionMetadata extends Context.Service<
  ExecutionMetadata,
  ReturnType<typeof make>
>()("@confect/server/ExecutionMetadata") {}

/**
 * @internal
 */
export const layer = (
  meta: Pick<QueryMeta, "getFunctionMetadata" | "getDeploymentMetadata">,
) => Layer.succeed(ExecutionMetadata, make(meta));
