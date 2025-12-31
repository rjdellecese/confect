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
import type * as ConfectApiFunctionSpec from "../api/ConfectApiFunctionSpec";
import type * as ConfectApiGroupSpec from "../api/ConfectApiGroupSpec";
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
  Functions extends
    ConfectApiFunctionSpec.ConfectApiFunctionSpec.AnyWithProps = never,
> {
  readonly [HandlersTypeId]: {
    _Functions: Types.Covariant<Functions>;
  };
  readonly group: ConfectApiGroupSpec.ConfectApiGroupSpec.AnyWithProps;
  readonly items: ReadonlyArray<Handlers.Item<ConfectSchema_, Functions>>;

  handle<
    Name extends ConfectApiFunctionSpec.ConfectApiFunctionSpec.Name<Functions>,
  >(
    name: Name,
    handler: ConfectApiHandler.ConfectApiHandler.WithName<
      ConfectSchema_,
      Functions,
      Name
    >,
  ): Handlers<
    ConfectSchema_,
    ConfectApiFunctionSpec.ConfectApiFunctionSpec.ExcludeName<Functions, Name>
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
  Function extends ConfectApiFunctionSpec.ConfectApiFunctionSpec.AnyWithProps,
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
      _Functions: Types.Covariant<ConfectApiFunctionSpec.ConfectApiFunctionSpec.AnyWithProps>;
    };
  }

  export interface AnyWithProps extends Any {
    readonly group: ConfectApiGroupSpec.ConfectApiGroupSpec.AnyWithProps;
    readonly items: ReadonlyArray<Handlers.Item.AnyWithProps>;

    handle<Name extends string>(
      name: Name,
      handler: ConfectApiHandler.ConfectApiHandler.AnyWithProps,
    ): AnyWithProps;
  }

  export interface Item<
    ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
    Function extends ConfectApiFunctionSpec.ConfectApiFunctionSpec.AnyWithProps,
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
      readonly function_: ConfectApiFunctionSpec.ConfectApiFunctionSpec.AnyWithProps;
      readonly handler: ConfectApiHandler.ConfectApiHandler.AnyWithProps;
    }
  }

  export type FromGroup<
    ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
    Group extends ConfectApiGroupSpec.ConfectApiGroupSpec.AnyWithProps,
  > = Handlers<
    ConfectSchema_,
    ConfectApiGroupSpec.ConfectApiGroupSpec.Functions<Group>
  >;

  export type ValidateReturn<A> =
    A extends Handlers<infer _S, infer Functions>
      ? [Functions] extends [never]
        ? A
        : `Function not handled: ${ConfectApiFunctionSpec.ConfectApiFunctionSpec.Name<Functions>}`
      : "Must return the implemented handlers";
}

const HandlersProto = {
  [HandlersTypeId]: {
    _Functions: Function.identity,
  },

  handle<ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps>(
    this: Handlers<
      ConfectSchema_,
      ConfectApiFunctionSpec.ConfectApiFunctionSpec.AnyWithProps
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
  Functions extends ConfectApiFunctionSpec.ConfectApiFunctionSpec.AnyWithProps,
>({
  group,
  items,
}: {
  readonly group: ConfectApiGroupSpec.ConfectApiGroupSpec.AnyWithProps;
  readonly items: ReadonlyArray<Handlers.Item<ConfectSchema_, Functions>>;
}): Handlers<ConfectSchema_, Functions> =>
  Object.assign(Object.create(HandlersProto), { group, items });

export const group = <
  ConfectApi_ extends ConfectApi.ConfectApi.AnyWithProps,
  const GroupPath extends ConfectApiGroupSpec.Path.All<
    ConfectApi.ConfectApi.Groups<ConfectApi_>
  >,
  Return extends Handlers.AnyWithProps,
>(
  confectApi: ConfectApi_,
  groupPath: GroupPath,
  build: (
    handlers: Handlers.FromGroup<
      ConfectApi.ConfectApi.ConfectSchema<ConfectApi_>,
      ConfectApiGroupSpec.Path.GroupAt<
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

  const group_: ConfectApiGroupSpec.ConfectApiGroupSpec.AnyWithProps =
    Array.reduce(
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
  export type FromGroups<
    Groups extends ConfectApiGroupSpec.ConfectApiGroupSpec.Any,
  > = Groups extends never
    ? never
    : Groups extends ConfectApiGroupSpec.ConfectApiGroupSpec.AnyWithProps
      ? ConfectApiGroupService<
          ConfectApiGroupSpec.ConfectApiGroupSpec.Name<Groups>
        >
      : never;

  export type FromGroupWithPath<
    GroupPath extends string,
    Group extends ConfectApiGroupSpec.ConfectApiGroupSpec.AnyWithProps,
  > =
    ConfectApiGroupSpec.Path.SubGroupsAt<
      Group,
      GroupPath
    > extends infer SubGroupPaths
      ? SubGroupPaths extends string
        ? ConfectApiGroupService<SubGroupPaths>
        : never
      : never;
}
