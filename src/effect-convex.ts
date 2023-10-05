import {
  ArgsArray,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";

import { EffectAuth, EffectAuthImpl } from "./auth";
import {
  EffectDatabaseReader,
  EffectDatabaseReaderImpl,
  EffectDatabaseWriter,
  EffectDatabaseWriterImpl,
} from "./db";
import { EffectScheduler, EffectSchedulerImpl } from "./scheduler";
import {
  EffectStorageReader,
  EffectStorageReaderImpl,
  EffectStorageWriter,
  EffectStorageWriterImpl,
} from "./storage";

type EffectMutationCtx<DataModel extends GenericDataModel> = {
  db: EffectDatabaseWriter<DataModel>;
  auth: EffectAuth;
  storage: EffectStorageWriter;
  scheduler: EffectScheduler;
};

type EffectQueryCtx<DataModel extends GenericDataModel> = {
  db: EffectDatabaseReader<DataModel>;
  auth: EffectAuth;
  storage: EffectStorageReader;
  scheduler: EffectScheduler;
};

export const EffectConvex = <DataModel extends GenericDataModel>() => {
  const withEffectQuery = <Args extends ArgsArray, Output>(
    f: (ctx: EffectMutationCtx<DataModel>, ...args: Args) => Output
  ): Handler<DataModel, GenericMutationCtx<DataModel>, Args, Output> => {
    return ((ctx: GenericMutationCtx<DataModel>, ...args: Args) => {
      const wrappedDb = new EffectDatabaseWriterImpl(ctx, ctx.db);
      const wrappedAuth = new EffectAuthImpl(ctx.auth);
      const wrappedStorage = new EffectStorageWriterImpl(ctx.storage);
      const wrappedScheduler = new EffectSchedulerImpl(ctx.scheduler);
      return f(
        {
          db: wrappedDb,
          auth: wrappedAuth,
          storage: wrappedStorage,
          scheduler: wrappedScheduler,
        },
        ...args
      );
    }) as Handler<DataModel, GenericMutationCtx<DataModel>, Args, Output>;
  };
  const withEffectMutation = <Args extends ArgsArray, Output>(
    f: (ctx: EffectQueryCtx<DataModel>, ...args: Args) => Output
  ): Handler<DataModel, GenericQueryCtx<DataModel>, Args, Output> => {
    return ((ctx: any, ...args: any[]) => {
      const wrappedDb = new EffectDatabaseReaderImpl(ctx, ctx.db);
      const wrappedAuth = new EffectAuthImpl(ctx.auth);
      const wrappedStorage = new EffectStorageReaderImpl(ctx.auth);
      const wrappedScheduler = new EffectSchedulerImpl(ctx.scheduler);
      return (f as any)(
        {
          db: wrappedDb,
          auth: wrappedAuth,
          storage: wrappedStorage,
          scheduler: wrappedScheduler,
        },
        ...args
      );
    }) as Handler<DataModel, GenericQueryCtx<DataModel>, Args, Output>;
  };
  return {
    withEffectQuery,
    withEffectMutation,
  };
};

type Handler<
  DataModel extends GenericDataModel,
  Ctx extends GenericQueryCtx<DataModel>,
  Args extends ArgsArray,
  Output,
> = (ctx: Ctx, ...args: Args) => Output;
