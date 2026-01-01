import { FunctionSpec } from "../api/FunctionSpec.js";
import { ActionRunner } from "./ActionRunner.js";
import { DatabaseSchema } from "./DatabaseSchema.js";
import { ActionCtx } from "./ActionCtx.js";
import { Auth } from "./Auth.js";
import { DataModel } from "./DataModel.js";
import { DatabaseReader } from "./DatabaseReader.js";
import { DatabaseWriter } from "./DatabaseWriter.js";
import { MutationCtx } from "./MutationCtx.js";
import { MutationRunner } from "./MutationRunner.js";
import { QueryCtx } from "./QueryCtx.js";
import { QueryRunner } from "./QueryRunner.js";
import { Scheduler } from "./Scheduler.js";
import { StorageActionWriter, StorageReader, StorageWriter } from "./Storage.js";
import { VectorSearch } from "./VectorSearch.js";
import { Effect } from "effect";

//#region src/server/RegistryItem.d.ts
declare namespace RegistryItem_d_exports {
  export { ActionHandler, Handler, MutationHandler, QueryHandler, RegistryItem, RegistryItemTypeId, isRegistryItem, make };
}
type Handler<Schema$1 extends DatabaseSchema.AnyWithProps, Function$1 extends FunctionSpec.AnyWithProps> = Function$1 extends FunctionSpec.WithFunctionType<Function$1, "Query"> ? QueryHandler<Schema$1, Function$1> : Function$1 extends FunctionSpec.WithFunctionType<Function$1, "Mutation"> ? MutationHandler<Schema$1, Function$1> : Function$1 extends FunctionSpec.WithFunctionType<Function$1, "Action"> ? ActionHandler<Schema$1, Function$1> : never;
type QueryHandler<Schema$1 extends DatabaseSchema.AnyWithProps, Function$1 extends FunctionSpec.AnyWithPropsWithFunctionType<"Query">> = BaseHandler<Function$1, DatabaseReader<Schema$1> | Auth | StorageReader | QueryRunner | QueryCtx<DataModel.ToConvex<DataModel.FromSchema<Schema$1>>>>;
type MutationHandler<Schema$1 extends DatabaseSchema.AnyWithProps, Function$1 extends FunctionSpec.AnyWithPropsWithFunctionType<"Mutation">> = BaseHandler<Function$1, DatabaseReader<Schema$1> | DatabaseWriter<Schema$1> | Auth | Scheduler | StorageReader | StorageWriter | QueryRunner | MutationRunner | MutationCtx<DataModel.ToConvex<DataModel.FromSchema<Schema$1>>>>;
type ActionHandler<Schema$1 extends DatabaseSchema.AnyWithProps, Function$1 extends FunctionSpec.AnyWithPropsWithFunctionType<"Action">> = BaseHandler<Function$1, Scheduler | Auth | StorageReader | StorageWriter | StorageActionWriter | QueryRunner | MutationRunner | ActionRunner | VectorSearch<DataModel.FromSchema<Schema$1>> | ActionCtx<DataModel.ToConvex<DataModel.FromSchema<Schema$1>>>>;
type BaseHandler<Function$1 extends FunctionSpec.AnyWithProps, R> = (args: FunctionSpec.Args<Function$1>["Type"]) => Effect.Effect<FunctionSpec.Returns<Function$1>["Type"], never, R>;
declare namespace Handler {
  type AnyWithProps = Handler<DatabaseSchema.AnyWithProps, FunctionSpec.AnyWithProps>;
  type WithName<Schema$1 extends DatabaseSchema.AnyWithProps, Function$1 extends FunctionSpec.AnyWithProps, Name extends string> = Handler<Schema$1, FunctionSpec.WithName<Function$1, Name>>;
}
declare const RegistryItemTypeId = "@rjdellecese/confect/server/RegistryItem";
type RegistryItemTypeId = typeof RegistryItemTypeId;
declare const isRegistryItem: (value: unknown) => value is RegistryItem.AnyWithProps;
interface RegistryItem<Schema$1 extends DatabaseSchema.AnyWithProps, Function$1 extends FunctionSpec.AnyWithProps> {
  readonly [RegistryItemTypeId]: RegistryItemTypeId;
  readonly function_: Function$1;
  readonly handler: Handler<Schema$1, Function$1>;
}
declare namespace RegistryItem {
  interface AnyWithProps {
    readonly [RegistryItemTypeId]: RegistryItemTypeId;
    readonly function_: FunctionSpec.AnyWithProps;
    readonly handler: Handler.AnyWithProps;
  }
}
declare const make: <Schema$1 extends DatabaseSchema.AnyWithProps, Function$1 extends FunctionSpec.AnyWithProps>({
  function_,
  handler
}: {
  function_: Function$1;
  handler: Handler<Schema$1, Function$1>;
}) => RegistryItem<Schema$1, Function$1>;
//#endregion
export { ActionHandler, Handler, MutationHandler, QueryHandler, RegistryItem, RegistryItemTypeId, RegistryItem_d_exports, isRegistryItem, make };
//# sourceMappingURL=RegistryItem.d.ts.map