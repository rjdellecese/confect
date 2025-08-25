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
import * as ConfectApi from "./ConfectApi";
import * as ConfectApiFunction from "./ConfectApiFunction";
import * as ConfectApiGroup from "./ConfectApiGroup";

export const HandlersTypeId = Symbol.for("@rjdellecese/confect/Handlers");

export type HandlersTypeId = typeof HandlersTypeId;

export interface Handlers<
  Functions extends ConfectApiFunction.ConfectApiFunction.Any = never,
> {
  readonly [HandlersTypeId]: {
    _Functions: Types.Covariant<Functions>;
  };
  readonly group: ConfectApiGroup.ConfectApiGroup.AnyWithProps;
  readonly handlers: Chunk.Chunk<Handlers.Item>;

  handle<Name extends ConfectApiFunction.ConfectApiFunction.Name<Functions>>(
    name: Name,
    handler: ConfectApiFunction.Handler.WithName<Functions, Name>
  ): Handlers<
    ConfectApiFunction.ConfectApiFunction.ExcludeName<Functions, Name>
  >;
}

export declare namespace Handlers {
  export interface Item {
    readonly function_: ConfectApiFunction.ConfectApiFunction.Any;
    readonly handler: ConfectApiFunction.Handler.Any;
  }

  export type FromGroup<Group extends ConfectApiGroup.ConfectApiGroup.Any> =
    Handlers<ConfectApiGroup.ConfectApiGroup.Functions<Group>>;

  export type ValidateReturn<A> =
    A extends Handlers<infer Functions>
      ? [Functions] extends [never]
        ? A
        : `Function not handled: ${ConfectApiFunction.ConfectApiFunction.Name<Functions>}`
      : "Must return the implemented handlers";
}

const HandlersProto = {
  [HandlersTypeId]: {
    _Functions: Function.identity,
  },

  handle(
    this: Handlers<ConfectApiFunction.ConfectApiFunction.Any>,
    name: string,
    handler: ConfectApiFunction.Handler.Any
  ) {
    const function_ = this.group.functions[name];
    return makeHandlers({
      group: this.group,
      handlers: Chunk.append(this.handlers, {
        function_,
        handler,
      }) as any,
    });
  },
};

const makeHandlers = <
  Functions extends ConfectApiFunction.ConfectApiFunction.Any,
>({
  group,
  handlers,
}: {
  readonly group: ConfectApiGroup.ConfectApiGroup.AnyWithProps;
  readonly handlers: Chunk.Chunk<Handlers.Item>;
}): Handlers<Functions> =>
  Object.assign(Object.create(HandlersProto), { group, handlers });

export const group = <
  const ApiName extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
  const GroupName extends ConfectApiGroup.ConfectApiGroup.Name<Groups>,
  Return,
>(
  api: ConfectApi.ConfectApi<ApiName, Groups>,
  groupName: GroupName,
  build: (
    handlers: Handlers.FromGroup<
      ConfectApiGroup.ConfectApiGroup.WithName<Groups, GroupName>
    >
  ) => Handlers.ValidateReturn<Return>
): Layer.Layer<
  ConfectApiGroupService<
    ApiName,
    ConfectApiGroup.ConfectApiGroup.WithName<Groups, GroupName>
  >
> => {
  const group = api.groups[
    groupName
  ]! as ConfectApiGroup.ConfectApiGroup.WithName<Groups, GroupName>;
  const handlers = Chunk.empty();

  return Layer.succeed(
    ConfectApiGroupService<
      ApiName,
      ConfectApiGroup.ConfectApiGroup.WithName<Groups, GroupName>
    >({
      apiName: api.name,
      group,
    }),
    {
      apiName: api.name,
      handlers: build(
        makeHandlers({
          group,
          handlers,
        })
      ) as unknown as Handlers.FromGroup<
        ConfectApiGroup.ConfectApiGroup.WithName<Groups, GroupName>
      >,
    }
  );
};

export const api = <
  const ApiName extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.Any,
>(
  api: ConfectApi.ConfectApi<ApiName, Groups>
): Layer.Layer<
  ConfectApiService<ApiName, Groups>,
  never,
  GroupToService<ApiName, Groups>
> =>
  Layer.sync(ConfectApiService<ApiName, Groups>(api.name, api.groups), () => ({
    apiName: api.name,
    groupHandler: <
      GroupName extends ConfectApiGroup.ConfectApiGroup.Name<Groups>,
    >(
      groupName: GroupName
    ): Effect.Effect<
      Handlers.FromGroup<
        ConfectApiGroup.ConfectApiGroup.WithName<Groups, GroupName>
      >
    > =>
      Effect.gen(function* () {
        type Group = ConfectApiGroup.ConfectApiGroup.WithName<
          Groups,
          GroupName
        >;

        const group = api.groups[groupName]! as Group;

        const groupService = yield* ConfectApiGroupService({
          apiName: api.name,
          group,
        }) as unknown as Effect.Effect<ConfectApiGroupService<ApiName, Group>>;

        return groupService.handlers;
      }),
  }));

export type GroupToService<ApiName extends string, Group> =
  Group extends ConfectApiGroup.ConfectApiGroup<
    infer _GroupName,
    infer _Functions
  >
    ? ConfectApiGroupService<ApiName, Group>
    : never;

export interface ConfectApiGroupService<
  ApiName extends string,
  Group extends ConfectApiGroup.ConfectApiGroup.Any,
> {
  readonly apiName: ApiName;
  readonly handlers: Handlers.FromGroup<Group>;
}

export const ConfectApiGroupService = <
  ApiName extends string,
  Group extends ConfectApiGroup.ConfectApiGroup.Any,
>({
  apiName,
  group,
}: {
  apiName: string;
  group: Group;
}) =>
  Context.GenericTag<ConfectApiGroupService<ApiName, Group>>(
    `@rjdellecese/confect/ConfectApiGroupService/${apiName}/${group.name}`
  );

export interface ConfectApiService<
  ApiName extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.Any,
> {
  readonly apiName: ApiName;

  readonly groupHandler: <
    GroupName extends ConfectApiGroup.ConfectApiGroup.Name<Groups>,
  >(
    groupName: GroupName
  ) => Effect.Effect<
    Handlers.FromGroup<
      ConfectApiGroup.ConfectApiGroup.WithName<Groups, GroupName>
    >
  >;
}

export const ConfectApiService = <
  ApiName extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.Any,
>(
  apiName: ApiName,
  groups: Record.ReadonlyRecord<string, Groups>
) => {
  const groupNamesIdentifier = pipe(
    Record.keys(groups),
    Array.sort(Order.string),
    Array.join("|")
  );

  return Context.GenericTag<ConfectApiService<ApiName, Groups>>(
    `@rjdellecese/confect/ConfectApiService/${apiName}/${groupNamesIdentifier}`
  );
};
