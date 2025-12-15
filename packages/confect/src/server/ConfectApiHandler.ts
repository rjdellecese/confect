import type { ConfectApiFunction } from "@rjdellecese/confect/api";
import type { Effect } from "effect";
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

export type ConfectApiHandler<
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
  Function extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
> =
  Function extends ConfectApiFunction.ConfectApiFunction.WithFunctionType<
    Function,
    "Query"
  >
    ? QueryHandler<ConfectSchema_, Function>
    : Function extends ConfectApiFunction.ConfectApiFunction.WithFunctionType<
          Function,
          "Mutation"
        >
      ? MutationHandler<ConfectSchema_, Function>
      : Function extends ConfectApiFunction.ConfectApiFunction.WithFunctionType<
            Function,
            "Action"
          >
        ? ActionHandler<ConfectSchema_, Function>
        : never;

export type QueryHandler<
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
  Function extends
    ConfectApiFunction.ConfectApiFunction.AnyWithPropsWithFunctionType<"Query">,
> = BaseHandler<
  Function,
  | ConfectDatabaseReader.ConfectDatabaseReader<ConfectSchema_>
  | ConfectAuth.ConfectAuth
  | ConfectStorageReader
  | ConfectQueryRunner.ConfectQueryRunner
  | ConvexQueryCtx.ConvexQueryCtx<
      ConfectSchema.DataModelFromConfectSchema<ConfectSchema_>
    >
>;

export type MutationHandler<
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
  Function extends
    ConfectApiFunction.ConfectApiFunction.AnyWithPropsWithFunctionType<"Mutation">,
> = BaseHandler<
  Function,
  | ConfectDatabaseReader.ConfectDatabaseReader<ConfectSchema_>
  | ConfectDatabaseWriter.ConfectDatabaseWriter<ConfectSchema_>
  | ConfectAuth.ConfectAuth
  | ConfectScheduler.ConfectScheduler
  | ConfectStorageReader
  | ConfectStorageWriter
  | ConfectQueryRunner.ConfectQueryRunner
  | ConfectMutationRunner.ConfectMutationRunner
  | ConvexMutationCtx.ConvexMutationCtx<
      ConfectSchema.DataModelFromConfectSchema<ConfectSchema_>
    >
>;

export type ActionHandler<
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
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
  | ConvexActionCtx.ConvexActionCtx<
      ConfectSchema.DataModelFromConfectSchema<ConfectSchema_>
    >
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

export declare namespace ConfectApiHandler {
  export type AnyWithProps = ConfectApiHandler<
    ConfectSchema.ConfectSchema.AnyWithProps,
    ConfectApiFunction.ConfectApiFunction.AnyWithProps
  >;

  export type WithName<
    ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
    Function extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
    Name extends string,
  > = ConfectApiHandler<
    ConfectSchema_,
    ConfectApiFunction.ConfectApiFunction.WithName<Function, Name>
  >;
}
