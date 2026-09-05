import type * as IdScope from "@confect/core/IdScope";
import type { GenericId, Rebase } from "@confect/core/GenericId";
import type {
  DocumentByName,
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  QueryInitializer,
  NamedTableInfo,
  TableNamesInDataModel,
  SystemDataModel,
  WithoutSystemFields,
  WithOptionalSystemFields,
  SchedulableFunctionReference,
  OptionalRestArgs,
  VectorIndexNames,
  VectorSearchQuery,
} from "convex/server";
import type { PatchValue } from "./DatabaseWriter";

/** Distinguishes raw component services from structurally compatible app ctxs. */
export interface Identifier<
  Kind extends string,
  DataModel,
  Scope extends IdScope.IdScope,
> {
  readonly "~@confect/server/ComponentCtx": {
    readonly kind: Kind;
    readonly dataModel: DataModel;
    readonly scope: Scope;
  };
}

interface Reader<
  DataModel extends GenericDataModel,
  Scope extends IdScope.IdScope,
> {
  get<TableName extends TableNamesInDataModel<DataModel>>(
    table: TableName,
    id: GenericId<NoInfer<TableName>, Scope>,
  ): Promise<DocumentByName<DataModel, TableName> | null>;
  get<TableName extends TableNamesInDataModel<DataModel>>(
    id: GenericId<TableName, Scope>,
  ): Promise<DocumentByName<DataModel, TableName> | null>;
  normalizeId<TableName extends TableNamesInDataModel<DataModel>>(
    table: TableName,
    id: string,
  ): GenericId<TableName, Scope> | null;
  query<TableName extends TableNamesInDataModel<DataModel>>(
    table: TableName,
  ): QueryInitializer<NamedTableInfo<DataModel, TableName>>;
}

type ScopedSystem<Scope extends IdScope.IdScope> = Rebase<
  SystemDataModel,
  IdScope.App,
  Scope
>;

export interface DatabaseReader<
  DataModel extends GenericDataModel,
  Scope extends IdScope.IdScope,
> extends Reader<DataModel, Scope> {
  readonly system: Reader<ScopedSystem<Scope>, Scope>;
}

export interface DatabaseWriter<
  DataModel extends GenericDataModel,
  Scope extends IdScope.IdScope,
> extends DatabaseReader<DataModel, Scope> {
  insert<TableName extends TableNamesInDataModel<DataModel>>(
    table: TableName,
    value: WithoutSystemFields<DocumentByName<DataModel, TableName>>,
  ): Promise<GenericId<TableName, Scope>>;
  patch<TableName extends TableNamesInDataModel<DataModel>>(
    table: TableName,
    id: GenericId<NoInfer<TableName>, Scope>,
    value: PatchValue<
      WithoutSystemFields<DocumentByName<DataModel, TableName>>
    >,
  ): Promise<void>;
  patch<TableName extends TableNamesInDataModel<DataModel>>(
    id: GenericId<TableName, Scope>,
    value: PatchValue<
      WithoutSystemFields<DocumentByName<DataModel, TableName>>
    >,
  ): Promise<void>;
  replace<TableName extends TableNamesInDataModel<DataModel>>(
    table: TableName,
    id: GenericId<NoInfer<TableName>, Scope>,
    value: WithOptionalSystemFields<DocumentByName<DataModel, TableName>>,
  ): Promise<void>;
  replace<TableName extends TableNamesInDataModel<DataModel>>(
    id: GenericId<TableName, Scope>,
    value: WithOptionalSystemFields<DocumentByName<DataModel, TableName>>,
  ): Promise<void>;
  delete<TableName extends TableNamesInDataModel<DataModel>>(
    table: TableName,
    id: GenericId<NoInfer<TableName>, Scope>,
  ): Promise<void>;
  delete<TableName extends TableNamesInDataModel<DataModel>>(
    id: GenericId<TableName, Scope>,
  ): Promise<void>;
}

export interface StorageReader<Scope extends IdScope.IdScope> {
  getUrl(id: GenericId<"_storage", Scope>): Promise<string | null>;
  getMetadata(
    id: GenericId<"_storage", Scope>,
  ): Promise<
    Rebase<
      Awaited<
        ReturnType<GenericQueryCtx<GenericDataModel>["storage"]["getMetadata"]>
      >,
      IdScope.App,
      Scope
    >
  >;
}

export interface StorageWriter<
  Scope extends IdScope.IdScope,
> extends StorageReader<Scope> {
  generateUploadUrl(): Promise<string>;
  delete(id: GenericId<"_storage", Scope>): Promise<void>;
}

export interface StorageActionWriter<
  Scope extends IdScope.IdScope,
> extends StorageWriter<Scope> {
  get(id: GenericId<"_storage", Scope>): Promise<Blob | null>;
  store(
    blob: Blob,
    options?: { sha256?: string },
  ): Promise<GenericId<"_storage", Scope>>;
}

export interface Scheduler<Scope extends IdScope.IdScope> {
  runAfter<FunctionReference extends SchedulableFunctionReference>(
    delayMs: number,
    ref: FunctionReference,
    ...args: OptionalRestArgs<FunctionReference>
  ): Promise<GenericId<"_scheduled_functions", Scope>>;
  runAt<FunctionReference extends SchedulableFunctionReference>(
    timestamp: number | Date,
    ref: FunctionReference,
    ...args: OptionalRestArgs<FunctionReference>
  ): Promise<GenericId<"_scheduled_functions", Scope>>;
  cancel(id: GenericId<"_scheduled_functions", Scope>): Promise<void>;
}

export type Query<
  DataModel extends GenericDataModel,
  Scope extends IdScope.IdScope,
> = Omit<GenericQueryCtx<DataModel>, "auth" | "db" | "storage"> & {
  readonly db: DatabaseReader<DataModel, Scope>;
  readonly storage: StorageReader<Scope>;
};

export type Mutation<
  DataModel extends GenericDataModel,
  Scope extends IdScope.IdScope,
> = Omit<
  GenericMutationCtx<DataModel>,
  "auth" | "db" | "storage" | "scheduler"
> & {
  readonly db: DatabaseWriter<DataModel, Scope>;
  readonly storage: StorageWriter<Scope>;
  readonly scheduler: Scheduler<Scope>;
};

export type Action<
  DataModel extends GenericDataModel,
  Scope extends IdScope.IdScope,
> = Omit<
  GenericActionCtx<DataModel>,
  "auth" | "storage" | "vectorSearch" | "scheduler"
> & {
  readonly storage: StorageActionWriter<Scope>;
  readonly scheduler: Scheduler<Scope>;
  readonly vectorSearch: <
    TableName extends TableNamesInDataModel<DataModel>,
    IndexName extends VectorIndexNames<NamedTableInfo<DataModel, TableName>>,
  >(
    table: TableName,
    index: IndexName,
    query: VectorSearchQuery<NamedTableInfo<DataModel, TableName>, IndexName>,
  ) => Promise<Array<{ _id: GenericId<TableName, Scope>; _score: number }>>;
};
