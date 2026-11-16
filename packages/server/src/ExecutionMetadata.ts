import type { QueryMeta } from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

/**
 * Native Convex metadata returned by getDeployment and getFunction.
 *
 * @category Models
 */
export type { DeploymentMetadata, FunctionMetadata } from "convex/server";

const make = (
  meta: Pick<QueryMeta, "getFunctionMetadata" | "getDeploymentMetadata">,
) => ({
  /**
   * Read metadata for the current function, including its name and component.
   *
   * @category Getters
   *
   * @returns An Effect producing native FunctionMetadata; native rejection is a
   *   defect.
   */
  getFunction: Effect.fn("ExecutionMetadata.getFunction")(() =>
    Effect.promise(() => meta.getFunctionMetadata()),
  ),
  /**
   * Read metadata for the deployment executing this invocation.
   *
   * @category Getters
   *
   * @returns An Effect producing native DeploymentMetadata; native rejection is
   *   a defect.
   */
  getDeployment: Effect.fn("ExecutionMetadata.getDeployment")(() =>
    Effect.promise(() => meta.getDeploymentMetadata()),
  ),
});

/**
 * Function/deployment metadata service available in every function context.
 * Acquire the generated `ExecutionMetadata` tag; metadata remains
 * Convex-owned.
 *
 * @category Services
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
