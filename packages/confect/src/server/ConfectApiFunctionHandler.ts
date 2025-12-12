/**
 * Handler types for ConfectApiFunction.
 * These are separated from ConfectApiFunction because they depend on server modules.
 */
import type { Effect } from "effect";
import type * as ConfectApiFunction from "../api/ConfectApiFunction";
import type * as ConfectActionRunner from "./ConfectActionRunner";
import type * as ConfectAuth from "./ConfectAuth";
import type * as ConfectDatabaseReader from "./ConfectDatabaseReader";
import type * as ConfectDatabaseWriter from "./ConfectDatabaseWriter";
import type * as ConfectMutationRunner from "./ConfectMutationRunner";
import type * as ConfectQueryRunner from "./ConfectQueryRunner";
import type * as ConfectScheduler from "./ConfectScheduler";
import type * as ConfectSchema from "./ConfectSchema";
import type {
  ConfectStorageActionWriter,
  ConfectStorageReader,
  ConfectStorageWriter,
} from "./ConfectStorage";
import type * as ConfectVectorSearch from "./ConfectVectorSearch";
import type * as ConvexActionCtx from "./ConvexActionCtx";
import type * as ConvexMutationCtx from "./ConvexMutationCtx";
import type * as ConvexQueryCtx from "./ConvexQueryCtx";

export type Handler<
  S extends ConfectSchema.ConfectSchema.AnyWithProps,
  Function extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
> =
  Function extends ConfectApiFunction.ConfectApiFunction.WithFunctionType<
    Function,
    "Query"
  >
    ? QueryHandler<S, Function>
    : Function extends ConfectApiFunction.ConfectApiFunction.WithFunctionType<
          Function,
          "Mutation"
        >
      ? MutationHandler<S, Function>
      : Function extends ConfectApiFunction.ConfectApiFunction.WithFunctionType<
            Function,
            "Action"
          >
        ? ActionHandler<S, Function>
        : never;

export type QueryHandler<
  S extends ConfectSchema.ConfectSchema.AnyWithProps,
  Function extends
    ConfectApiFunction.ConfectApiFunction.AnyWithPropsWithFunctionType<"Query">,
> = BaseHandler<
  Function,
  | ConfectDatabaseReader.ConfectDatabaseReader<S>
  | ConfectAuth.ConfectAuth
  | ConfectStorageReader
  | ConfectQueryRunner.ConfectQueryRunner
  | ConvexQueryCtx.ConvexQueryCtx<ConfectSchema.DataModelFromConfectSchema<S>>
>;

export type MutationHandler<
  S extends ConfectSchema.ConfectSchema.AnyWithProps,
  Function extends
    ConfectApiFunction.ConfectApiFunction.AnyWithPropsWithFunctionType<"Mutation">,
> = BaseHandler<
  Function,
  | ConfectDatabaseReader.ConfectDatabaseReader<S>
  | ConfectDatabaseWriter.ConfectDatabaseWriter<S>
  | ConfectAuth.ConfectAuth
  | ConfectScheduler.ConfectScheduler
  | ConfectStorageReader
  | ConfectStorageWriter
  | ConfectQueryRunner.ConfectQueryRunner
  | ConfectMutationRunner.ConfectMutationRunner
  | ConvexMutationCtx.ConvexMutationCtx<
      ConfectSchema.DataModelFromConfectSchema<S>
    >
>;

export type ActionHandler<
  S extends ConfectSchema.ConfectSchema.AnyWithProps,
  Function extends
    ConfectApiFunction.ConfectApiFunction.AnyWithPropsWithFunctionType<"Action">,
> = BaseHandler<
  Function,
  | ConfectScheduler.ConfectScheduler
  | ConfectAuth.ConfectAuth
  | ConfectStorageReader
  | ConfectStorageWriter
  | ConfectStorageActionWriter
  | ConfectQueryRunner.ConfectQueryRunner
  | ConfectMutationRunner.ConfectMutationRunner
  | ConfectActionRunner.ConfectActionRunner
  | ConfectVectorSearch.ConfectVectorSearch
  | ConvexActionCtx.ConvexActionCtx<ConfectSchema.DataModelFromConfectSchema<S>>
>;

type BaseHandler<
  Function extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
  R,
> = (
  args: ConfectApiFunction.ConfectApiFunction.Args<Function>["Type"],
) => Effect.Effect<
  ConfectApiFunction.ConfectApiFunction.Returns<Function>["Type"],
  never,
  R
>;

export declare namespace Handler {
  export type AnyWithProps = Handler<
    ConfectSchema.ConfectSchema.AnyWithProps,
    ConfectApiFunction.ConfectApiFunction.AnyWithProps
  >;

  export type WithName<
    S extends ConfectSchema.ConfectSchema.AnyWithProps,
    Function extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
    Name extends string,
  > = Handler<
    S,
    ConfectApiFunction.ConfectApiFunction.WithName<Function, Name>
  >;
}
