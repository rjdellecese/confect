import type * as ConfectApiFunction from "../api/ConfectApiFunction";
import type * as ConfectApiGroup from "../api/ConfectApiGroup";
import type { Types } from "effect";
import {
  Array,
  Context,
  Effect,
  Function,
  Layer,
  Predicate,
  Ref,
  String,
} from "effect";
import { setNestedProperty } from "../internal/utils";
import type * as ConfectApi from "./ConfectApi";
import type * as ConfectApiHandler from "./ConfectApiHandler";
import * as ConfectApiRegistry from "./ConfectApiRegistry";
import type * as ConfectSchema from "./ConfectSchema";

export const HandlersTypeId =
  "@rjdellecese/confect/server/ConfectApiBuilder/Handlers";
export type HandlersTypeId = typeof HandlersTypeId;

export interface Handlers<
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
  Functions extends ConfectApiFunction.ConfectApiFunction.AnyWithProps = never,
> {
  readonly [HandlersTypeId]: {
    _Functions: Types.Covariant<Functions>;
  };
  readonly group: ConfectApiGroup.ConfectApiGroup.AnyWithProps;
  readonly items: ReadonlyArray<Handlers.Item<ConfectSchema_, Functions>>;

  handle<Name extends ConfectApiFunction.ConfectApiFunction.Name<Functions>>(
    name: Name,
    handler: ConfectApiHandler.ConfectApiHandler.WithName<
      ConfectSchema_,
      Functions,
      Name
    >,
  ): Handlers<
    ConfectSchema_,
    ConfectApiFunction.ConfectApiFunction.ExcludeName<Functions, Name>
  >;
}

export const HandlerItemTypeId =
  "@rjdellecese/confect/server/ConfectApiBuilder/HandlerItem";
export type HandlerItemTypeId = typeof HandlerItemTypeId;

export const isHandlerItem = (
  value: unknown,
): value is Handlers.Item.AnyWithProps =>
  Predicate.hasProperty(value, HandlerItemTypeId);

const HandlerItemProto = {
  [HandlerItemTypeId]: HandlerItemTypeId,
};

const makeHandlerItem = <
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
  Function extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
>({
  function_,
  handler,
}: {
  function_: Function;
  handler: ConfectApiHandler.ConfectApiHandler<ConfectSchema_, Function>;
}): Handlers.Item<ConfectSchema_, Function> =>
  Object.assign(Object.create(HandlerItemProto), { function_, handler });

export declare namespace Handlers {
  export interface Any {
    readonly [HandlersTypeId]: {
      _Functions: Types.Covariant<ConfectApiFunction.ConfectApiFunction.AnyWithProps>;
    };
  }

  export interface AnyWithProps extends Any {
    readonly group: ConfectApiGroup.ConfectApiGroup.AnyWithProps;
    readonly items: ReadonlyArray<Handlers.Item.AnyWithProps>;

    handle<Name extends string>(
      name: Name,
      handler: ConfectApiHandler.ConfectApiHandler.AnyWithProps,
    ): AnyWithProps;
  }

  export interface Item<
    ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
    Function extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
  > {
    readonly [HandlerItemTypeId]: HandlerItemTypeId;
    readonly function_: Function;
    readonly handler: ConfectApiHandler.ConfectApiHandler<
      ConfectSchema_,
      Function
    >;
  }

  export namespace Item {
    // eslint-disable-next-line @typescript-eslint/no-shadow
    export interface AnyWithProps {
      readonly function_: ConfectApiFunction.ConfectApiFunction.AnyWithProps;
      readonly handler: ConfectApiHandler.ConfectApiHandler.AnyWithProps;
    }
  }

  export type FromGroup<
    ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
    Group extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
  > = Handlers<
    ConfectSchema_,
    ConfectApiGroup.ConfectApiGroup.Functions<Group>
  >;

  export type ValidateReturn<A> =
    A extends Handlers<infer _S, infer Functions>
      ? [Functions] extends [never]
        ? A
        : `Function not handled: ${ConfectApiFunction.ConfectApiFunction.Name<Functions>}`
      : "Must return the implemented handlers";
}

const HandlersProto = {
  [HandlersTypeId]: {
    _Functions: Function.identity,
  },

  handle<ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps>(
    this: Handlers<
      ConfectSchema_,
      ConfectApiFunction.ConfectApiFunction.AnyWithProps
    >,
    name: string,
    handler: ConfectApiHandler.ConfectApiHandler.AnyWithProps,
  ) {
    const function_ = this.group.functions[name]!;
    return makeHandlers({
      group: this.group,
      items: [
        ...this.items,
        makeHandlerItem({
          function_,
          handler,
        }),
      ],
    });
  },
};

const makeHandlers = <
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
  Functions extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
>({
  group,
  items,
}: {
  readonly group: ConfectApiGroup.ConfectApiGroup.AnyWithProps;
  readonly items: ReadonlyArray<Handlers.Item<ConfectSchema_, Functions>>;
}): Handlers<ConfectSchema_, Functions> =>
  Object.assign(Object.create(HandlersProto), { group, items });

export const group = <
  ConfectApi_ extends ConfectApi.ConfectApi.AnyWithProps,
  const GroupPath extends ConfectApiGroup.Path.All<
    ConfectApi.ConfectApi.Groups<ConfectApi_>
  >,
  Return extends Handlers.AnyWithProps,
>(
  confectApi: ConfectApi_,
  groupPath: GroupPath,
  build: (
    handlers: Handlers.FromGroup<
      ConfectApi.ConfectApi.ConfectSchema<ConfectApi_>,
      ConfectApiGroup.Path.GroupAt<
        ConfectApi.ConfectApi.Groups<ConfectApi_>,
        GroupPath
      >
    >,
  ) => Handlers.ValidateReturn<Return>,
): Layer.Layer<
  ConfectApiGroupService<GroupPath>,
  never,
  ConfectApiGroupService.FromGroupWithPath<
    GroupPath,
    ConfectApi.ConfectApi.Groups<ConfectApi_>
  >
> => {
  const groupPathParts = String.split(groupPath, ".");
  const [firstGroupPathPart, ...restGroupPathParts] = groupPathParts;

  const group_: ConfectApiGroup.ConfectApiGroup.AnyWithProps = Array.reduce(
    restGroupPathParts,
    (confectApi as any).spec.groups[firstGroupPathPart as any]!,
    (currentGroup: any, groupPathPart: any) =>
      currentGroup.groups[groupPathPart],
  );

  const items = Array.empty();

  return Layer.effect(
    ConfectApiGroupService<GroupPath>({
      groupPath,
    }),
    Effect.gen(function* () {
      const registry = yield* ConfectApiRegistry.ConfectApiRegistry;

      const handlers = build(
        makeHandlers({ group: group_, items }),
      ) as unknown as Handlers.AnyWithProps;

      for (const handlerItem of handlers.items) {
        yield* Ref.update(registry, (handlerItemsRegistry) =>
          setNestedProperty(
            handlerItemsRegistry,
            [...groupPathParts, handlerItem.function_.name],
            handlerItem,
          ),
        );
      }

      return yield* Effect.succeed({
        groupPath,
      });
    }),
  );
};

export const api = <ConfectApi_ extends ConfectApi.ConfectApi.AnyWithProps>(
  api_: ConfectApi_,
): Layer.Layer<
  ConfectApiService,
  never,
  ConfectApiGroupService.FromGroups<ConfectApi.ConfectApi.Groups<ConfectApi_>>
> =>
  Layer.effect(
    ConfectApiService,
    Effect.map(Effect.context(), (context) => ({
      api: api_,
      context,
    })),
  );

export interface ConfectApiGroupService<GroupPath extends string> {
  readonly groupPath: GroupPath;
}

export const ConfectApiGroupService = <GroupPath extends string>({
  groupPath,
}: {
  groupPath: GroupPath;
}) =>
  Context.GenericTag<ConfectApiGroupService<GroupPath>>(
    `@rjdellecese/confect/server/ConfectApiGroupService/${groupPath}`,
  );

export declare namespace ConfectApiGroupService {
  export type FromGroups<Groups extends ConfectApiGroup.ConfectApiGroup.Any> =
    Groups extends never
      ? never
      : Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps
        ? ConfectApiGroupService<ConfectApiGroup.ConfectApiGroup.Name<Groups>>
        : never;

  export type FromGroupWithPath<
    GroupPath extends string,
    Group extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
  > =
    ConfectApiGroup.Path.SubGroupsAt<
      Group,
      GroupPath
    > extends infer SubGroupPaths
      ? SubGroupPaths extends string
        ? ConfectApiGroupService<SubGroupPaths>
        : never
      : never;
}

export class ConfectApiService extends Context.Tag(
  "@rjdellecese/confect/server/ConfectApiBuilder/ConfectApiService",
)<
  ConfectApiService,
  {
    readonly api: ConfectApi.ConfectApi.AnyWithProps;
    readonly context: Context.Context<never>;
  }
>() {}
