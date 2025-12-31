import type * as ConfectApiFunctionSpec from "../api/ConfectApiFunctionSpec";
import type { Effect } from "effect";
import type * as ConfectActionRunner from "./ConfectActionRunner";
import type * as ConfectAuth from "./ConfectAuth";
import type * as ConfectDatabaseReader from "./ConfectDatabaseReader";
import type * as ConfectDatabaseWriter from "./ConfectDatabaseWriter";
import type * as ConfectDataModel from "./ConfectDataModel";
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

export type ConfectApiFunctionImpl<
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
  Function extends ConfectApiFunctionSpec.ConfectApiFunctionSpec.AnyWithProps,
> =
  Function extends ConfectApiFunctionSpec.ConfectApiFunctionSpec.WithFunctionType<
    Function,
    "Query"
  >
    ? QueryFunctionImpl<ConfectSchema_, Function>
    : Function extends ConfectApiFunctionSpec.ConfectApiFunctionSpec.WithFunctionType<
          Function,
          "Mutation"
        >
      ? MutationFunctionImpl<ConfectSchema_, Function>
      : Function extends ConfectApiFunctionSpec.ConfectApiFunctionSpec.WithFunctionType<
            Function,
            "Action"
          >
        ? ActionFunctionImpl<ConfectSchema_, Function>
        : never;

export type QueryFunctionImpl<
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
  Function extends
    ConfectApiFunctionSpec.ConfectApiFunctionSpec.AnyWithPropsWithFunctionType<"Query">,
> = BaseFunctionImpl<
  Function,
  | ConfectDatabaseReader.ConfectDatabaseReader<ConfectSchema_>
  | ConfectAuth.ConfectAuth
  | ConfectStorageReader
  | ConfectQueryRunner.ConfectQueryRunner
  | ConvexQueryCtx.ConvexQueryCtx<
      ConfectDataModel.ConfectDataModel.DataModel<
        ConfectDataModel.ConfectDataModel.FromSchema<ConfectSchema_>
      >
    >
>;

export type MutationFunctionImpl<
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
  Function extends
    ConfectApiFunctionSpec.ConfectApiFunctionSpec.AnyWithPropsWithFunctionType<"Mutation">,
> = BaseFunctionImpl<
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
      ConfectDataModel.ConfectDataModel.DataModel<
        ConfectDataModel.ConfectDataModel.FromSchema<ConfectSchema_>
      >
    >
>;

export type ActionFunctionImpl<
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
  Function extends
    ConfectApiFunctionSpec.ConfectApiFunctionSpec.AnyWithPropsWithFunctionType<"Action">,
> = BaseFunctionImpl<
  Function,
  | ConfectScheduler.ConfectScheduler
  | ConfectAuth.ConfectAuth
  | ConfectStorageReader
  | ConfectStorageWriter
  | ConfectStorageActionWriter
  | ConfectQueryRunner.ConfectQueryRunner
  | ConfectMutationRunner.ConfectMutationRunner
  | ConfectActionRunner.ConfectActionRunner
  | ConfectVectorSearch.ConfectVectorSearch<
      ConfectDataModel.ConfectDataModel.FromSchema<ConfectSchema_>
    >
  | ConvexActionCtx.ConvexActionCtx<
      ConfectDataModel.ConfectDataModel.DataModel<
        ConfectDataModel.ConfectDataModel.FromSchema<ConfectSchema_>
      >
    >
>;

type BaseFunctionImpl<
  Function extends ConfectApiFunctionSpec.ConfectApiFunctionSpec.AnyWithProps,
  R,
> = (
  args: ConfectApiFunctionSpec.ConfectApiFunctionSpec.Args<Function>["Type"],
) => Effect.Effect<
  ConfectApiFunctionSpec.ConfectApiFunctionSpec.Returns<Function>["Type"],
  never,
  R
>;

export declare namespace ConfectApiFunctionImpl {
  export type AnyWithProps = ConfectApiFunctionImpl<
    ConfectSchema.ConfectSchema.AnyWithProps,
    ConfectApiFunctionSpec.ConfectApiFunctionSpec.AnyWithProps
  >;

  export type WithName<
    ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
    Function extends ConfectApiFunctionSpec.ConfectApiFunctionSpec.AnyWithProps,
    Name extends string,
  > = ConfectApiFunctionImpl<
    ConfectSchema_,
    ConfectApiFunctionSpec.ConfectApiFunctionSpec.WithName<Function, Name>
  >;
}

