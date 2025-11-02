import {
  Array,
  Context,
  Function,
  Layer,
  Order,
  pipe,
  Record,
  String,
  Struct,
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
  readonly items: ReadonlyArray<Handlers.Item<ConfectSchema, Functions>>;

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
    Function extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
  > {
    readonly function_: Function;
    readonly handler: ConfectApiFunction.Handler<ConfectSchema, Function>;
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
    handler: ConfectApiFunction.Handler.AnyWithProps
  ) {
    const function_ = this.group.functions[name];
    return makeHandlers({
      group: this.group,
      items: [
        ...this.items,
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
  items,
}: {
  readonly group: ConfectApiGroup.ConfectApiGroup.AnyWithProps;
  readonly items: ReadonlyArray<Handlers.Item<ConfectSchema, Functions>>;
}): Handlers<ConfectSchema, Functions> =>
  Object.assign(Object.create(HandlersProto), { group, items });

export const group = <
  ConfectSchema extends GenericConfectSchema,
  const ApiName extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
  const GroupPath extends ConfectApiGroup.ConfectApiGroup.Path<Groups>,
  Return,
>(
  apiWithDatabaseSchema: ConfectApiWithDatabaseSchema.ConfectApiWithDatabaseSchema<
    ConfectSchema,
    ApiName,
    Groups
  >,
  groupPath: GroupPath,
  build: (
    handlers: Handlers.FromGroup<
      ConfectSchema,
      ConfectApiGroup.ConfectApiGroup.WithPath<Groups, GroupPath>
    >
  ) => Handlers.ValidateReturn<Return>
): Layer.Layer<
  ConfectApiGroupService<
    ConfectSchema,
    ApiName,
    ConfectApiGroup.ConfectApiGroup.WithPath<Groups, GroupPath>
  >,
  never,
  ConfectApiGroupService.FromGroups<
    ConfectSchema,
    ApiName,
    ConfectApiGroup.ConfectApiGroup.Groups<
      ConfectApiGroup.ConfectApiGroup.WithPath<Groups, GroupPath>
    >
  >
> => {
  const [firstGroupPathPart, ...restGroupPathParts] = String.split(
    groupPath,
    "."
  );

  const group = Array.reduce(
    restGroupPathParts,
    apiWithDatabaseSchema.api.groups[
      firstGroupPathPart as keyof typeof apiWithDatabaseSchema.api.groups
    ]!,
    (currentGroup, groupPathPart) =>
      currentGroup.groups[groupPathPart as keyof typeof currentGroup.groups]!
  );

  const items: any[] = [];

  return Layer.succeed(
    ConfectApiGroupService<
      ConfectSchema,
      ApiName,
      ConfectApiGroup.ConfectApiGroup.WithPath<Groups, GroupPath>
    >({
      apiName: apiWithDatabaseSchema.api.name,
      group: group as ConfectApiGroup.ConfectApiGroup.WithPath<
        Groups,
        GroupPath
      >,
    }),
    {
      apiName: apiWithDatabaseSchema.api.name,
      groupName: group.name,
      handlers: build(
        makeHandlers({
          group,
          items,
        })
      ) as unknown as Handlers.FromGroup<
        ConfectSchema,
        ConfectApiGroup.ConfectApiGroup.WithPath<Groups, GroupPath>
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
  ConfectApiGroupService.FromGroups<ConfectSchema, ApiName, Groups>
> =>
  Layer.succeed(
    ConfectApiService<ConfectSchema, ApiName, Groups>(
      apiWithDatabaseSchema.confectSchemaDefinition,
      apiWithDatabaseSchema.api.name,
      apiWithDatabaseSchema.api.groups
    ),
    {
      apiName: apiWithDatabaseSchema.api.name,
      groups: apiWithDatabaseSchema.api.groups,
    }
  );

export interface ConfectApiGroupService<
  ConfectSchema extends GenericConfectSchema,
  ApiName extends string,
  Group extends ConfectApiGroup.ConfectApiGroup.Any,
> {
  readonly apiName: ApiName;
  readonly groupName: Group["name"];
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
    // TODO: I think we need the full path here, not just the group name
    `@rjdellecese/confect/ConfectApiGroupService/${apiName}/${group.name}`
  );

export declare namespace ConfectApiGroupService {
  export type FromGroups<
    ConfectSchema extends GenericConfectSchema,
    ApiName extends string,
    Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
  > = Groups extends never
    ? never
    : ConfectApiGroupService<ConfectSchema, ApiName, Groups>;
}

export interface ConfectApiService<
  ConfectSchema extends GenericConfectSchema,
  ApiName extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
> {
  readonly apiName: ApiName;

  readonly groups: {
    [GroupName in Groups["name"]]: Extract<Groups, { name: GroupName }>;
  };
}

export const ConfectApiService = <
  ConfectSchema extends GenericConfectSchema,
  ApiName extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>,
  apiName: ApiName,
  groups: {
    [GroupName in Groups["name"]]: Extract<Groups, { name: GroupName }>;
  }
) => {
  const tableNamesIdentifier = pipe(
    confectSchemaDefinition.tableSchemas,
    Record.keys,
    Array.sort(Order.string),
    Array.join("|")
  );

  // TODO: Recurse
  const groupNamesIdentifier = pipe(
    Struct.keys(groups),
    Array.sort(Order.string),
    Array.join("|")
  );

  return Context.GenericTag<ConfectApiService<ConfectSchema, ApiName, Groups>>(
    // TODO: Maybe just `apiName` would suffice here?
    `@rjdellecese/confect/ConfectApiService/${tableNamesIdentifier}/${apiName}/${groupNamesIdentifier}`
  );
};
