import {
  Array,
  Chunk,
  Context,
  Effect,
  Function,
  Layer,
  Order,
  pipe,
  Record,
  Types,
} from "effect";
import {
  ConfectSchemaDefinition,
  GenericConfectSchema,
} from "../server/schema";
import * as ConfectApiFunction from "./ConfectApiFunction";
import * as ConfectApiGroup from "./ConfectApiGroup";
import * as ConfectApiWithDatabaseSchema from "./ConfectApiWithDatabaseSchema";

export const HandlersTypeId = Symbol.for("@rjdellecese/confect/Handlers");

export type HandlersTypeId = typeof HandlersTypeId;

export interface Handlers<
  ConfectSchema extends GenericConfectSchema,
  Functions extends ConfectApiFunction.ConfectApiFunction.AnyWithProps = never,
> {
  readonly [HandlersTypeId]: {
    _Functions: Types.Covariant<Functions>;
  };
  readonly group: ConfectApiGroup.ConfectApiGroup.AnyWithProps;
  readonly handlers: ReadonlyArray<Handlers.Item<ConfectSchema, Functions>>;

  handle<Name extends ConfectApiFunction.ConfectApiFunction.Name<Functions>>(
    name: Name,
    handler: ConfectApiFunction.Handler.WithName<ConfectSchema, Functions, Name>
  ): Handlers<
    ConfectSchema,
    ConfectApiFunction.ConfectApiFunction.ExcludeName<Functions, Name>
  >;
}

export declare namespace Handlers {
  export interface Item<
    ConfectSchema extends GenericConfectSchema,
    Functions extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
  > {
    readonly function_: Functions;
    readonly handler: ConfectApiFunction.Handler<ConfectSchema, Functions>;
  }

  export type FromGroup<
    ConfectSchema extends GenericConfectSchema,
    Group extends ConfectApiGroup.ConfectApiGroup.Any,
  > = Handlers<ConfectSchema, ConfectApiGroup.ConfectApiGroup.Functions<Group>>;

  export type ValidateReturn<A> =
    A extends Handlers<infer _ConfectSchema, infer Functions>
      ? [Functions] extends [never]
        ? A
        : `Function not handled: ${ConfectApiFunction.ConfectApiFunction.Name<Functions>}`
      : "Must return the implemented handlers";
}

const HandlersProto = {
  [HandlersTypeId]: {
    _Functions: Function.identity,
  },

  handle<ConfectSchema extends GenericConfectSchema>(
    this: Handlers<
      ConfectSchema,
      ConfectApiFunction.ConfectApiFunction.AnyWithProps
    >,
    name: string,
    handler: ConfectApiFunction.Handler.Any
  ) {
    const function_ = this.group.functions[name];
    return makeHandlers({
      group: this.group,
      handlers: [
        ...this.handlers,
        {
          function_,
          handler,
        },
      ] as any,
    });
  },
};

const makeHandlers = <
  ConfectSchema extends GenericConfectSchema,
  Functions extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
>({
  group,
  handlers,
}: {
  readonly group: ConfectApiGroup.ConfectApiGroup.AnyWithProps;
  readonly handlers: Chunk.Chunk<Handlers.Item<ConfectSchema, Functions>>;
}): Handlers<ConfectSchema, Functions> =>
  Object.assign(Object.create(HandlersProto), { group, handlers });

export const group = <
  ConfectSchema extends GenericConfectSchema,
  const ApiName extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
  const GroupName extends ConfectApiGroup.ConfectApiGroup.Name<Groups>,
  Return,
>(
  apiWithDatabaseSchema: ConfectApiWithDatabaseSchema.ConfectApiWithDatabaseSchema<
    ConfectSchema,
    ApiName,
    Groups
  >,
  groupName: GroupName,
  build: (
    handlers: Handlers.FromGroup<
      ConfectSchema,
      ConfectApiGroup.ConfectApiGroup.WithName<Groups, GroupName>
    >
  ) => Handlers.ValidateReturn<Return>
): Layer.Layer<
  ConfectApiGroupService<
    ConfectSchema,
    ApiName,
    ConfectApiGroup.ConfectApiGroup.WithName<Groups, GroupName>
  >
> => {
  const group = apiWithDatabaseSchema.api.groups[
    groupName
  ]! as ConfectApiGroup.ConfectApiGroup.WithName<Groups, GroupName>;
  const handlers = Chunk.empty();

  return Layer.succeed(
    ConfectApiGroupService<
      ConfectSchema,
      ApiName,
      ConfectApiGroup.ConfectApiGroup.WithName<Groups, GroupName>
    >({
      apiName: apiWithDatabaseSchema.api.name,
      group,
    }),
    {
      apiName: apiWithDatabaseSchema.api.name,
      handlers: build(
        makeHandlers({
          group,
          handlers,
        })
      ) as unknown as Handlers.FromGroup<
        ConfectSchema,
        ConfectApiGroup.ConfectApiGroup.WithName<Groups, GroupName>
      >,
    }
  );
};

export const api = <
  ConfectSchema extends GenericConfectSchema,
  const ApiName extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
>(
  apiWithDatabaseSchema: ConfectApiWithDatabaseSchema.ConfectApiWithDatabaseSchema<
    ConfectSchema,
    ApiName,
    Groups
  >
): Layer.Layer<
  ConfectApiService<ConfectSchema, ApiName, Groups>,
  never,
  GroupToService<ConfectSchema, ApiName, Groups>
> =>
  Layer.sync(
    ConfectApiService<ConfectSchema, ApiName, Groups>(
      apiWithDatabaseSchema.confectSchemaDefinition,
      apiWithDatabaseSchema.api.name,
      apiWithDatabaseSchema.api.groups
    ),
    () => ({
      apiName: apiWithDatabaseSchema.api.name,
      groupHandler: <
        GroupName extends ConfectApiGroup.ConfectApiGroup.Name<Groups>,
      >(
        groupName: GroupName
      ): Effect.Effect<
        Handlers.FromGroup<
          ConfectSchema,
          ConfectApiGroup.ConfectApiGroup.WithName<Groups, GroupName>
        >
      > =>
        Effect.gen(function* () {
          type Group = ConfectApiGroup.ConfectApiGroup.WithName<
            Groups,
            GroupName
          >;

          const group = apiWithDatabaseSchema.api.groups[groupName]! as Group;

          const groupService = yield* ConfectApiGroupService({
            apiName: apiWithDatabaseSchema.api.name,
            group,
          }) as unknown as Effect.Effect<
            ConfectApiGroupService<ConfectSchema, ApiName, Group>
          >;

          return groupService.handlers;
        }),
    })
  );

export type GroupToService<
  ConfectSchema extends GenericConfectSchema,
  ApiName extends string,
  Group,
> = Group extends ConfectApiGroup.ConfectApiGroup.AnyWithProps
  ? ConfectApiGroupService<ConfectSchema, ApiName, Group>
  : never;

export interface ConfectApiGroupService<
  ConfectSchema extends GenericConfectSchema,
  ApiName extends string,
  Group extends ConfectApiGroup.ConfectApiGroup.Any,
> {
  readonly apiName: ApiName;
  readonly handlers: Handlers.FromGroup<ConfectSchema, Group>;
}

export const ConfectApiGroupService = <
  ConfectSchema extends GenericConfectSchema,
  ApiName extends string,
  Group extends ConfectApiGroup.ConfectApiGroup.Any,
>({
  apiName,
  group,
}: {
  apiName: string;
  group: Group;
}) =>
  Context.GenericTag<ConfectApiGroupService<ConfectSchema, ApiName, Group>>(
    `@rjdellecese/confect/ConfectApiGroupService/${apiName}/${group.name}`
  );

export interface ConfectApiService<
  ConfectSchema extends GenericConfectSchema,
  ApiName extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
> {
  readonly apiName: ApiName;

  readonly groupHandler: <
    GroupName extends ConfectApiGroup.ConfectApiGroup.Name<Groups>,
  >(
    groupName: GroupName
  ) => Effect.Effect<
    Handlers.FromGroup<
      ConfectSchema,
      ConfectApiGroup.ConfectApiGroup.WithName<Groups, GroupName>
    >
  >;
}

export const ConfectApiService = <
  ConfectSchema extends GenericConfectSchema,
  ApiName extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>,
  apiName: ApiName,
  groups: Record.ReadonlyRecord<string, Groups>
) => {
  const tableNamesIdentifier = pipe(
    confectSchemaDefinition.tableSchemas,
    Record.keys,
    Array.sort(Order.string),
    Array.join("|")
  );

  const groupNamesIdentifier = pipe(
    Record.keys(groups),
    Array.sort(Order.string),
    Array.join("|")
  );

  return Context.GenericTag<ConfectApiService<ConfectSchema, ApiName, Groups>>(
    `@rjdellecese/confect/ConfectApiService/${tableNamesIdentifier}/${apiName}/${groupNamesIdentifier}`
  );
};
