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
import type * as ConfectApiFunctionHandler from "./ConfectApiFunctionHandler";
import type * as ConfectSchema from "./ConfectSchema";
import { setNestedProperty } from "../utils";
import type * as ConfectApi from "../api/ConfectApi";
import type * as ConfectApiFunction from "../api/ConfectApiFunction";
import type * as ConfectApiGroup from "../api/ConfectApiGroup";
import * as ConfectApiRegistry from "./ConfectApiRegistry";

export const HandlersTypeId = "@rjdellecese/confect/Handlers";
export type HandlersTypeId = typeof HandlersTypeId;

export interface Handlers<
  S extends ConfectSchema.ConfectSchema.AnyWithProps,
  Functions extends ConfectApiFunction.ConfectApiFunction.AnyWithProps = never,
> {
  readonly [HandlersTypeId]: {
    _Functions: Types.Covariant<Functions>;
  };
  readonly group: ConfectApiGroup.ConfectApiGroup.AnyWithProps;
  readonly items: ReadonlyArray<Handlers.Item<S, Functions>>;

  handle<Name extends ConfectApiFunction.ConfectApiFunction.Name<Functions>>(
    name: Name,
    handler: ConfectApiFunctionHandler.Handler.WithName<S, Functions, Name>,
  ): Handlers<
    S,
    ConfectApiFunction.ConfectApiFunction.ExcludeName<Functions, Name>
  >;
}

export const HandlerItemTypeId = "@rjdellecese/confect/HandlerItem";
export type HandlerItemTypeId = typeof HandlerItemTypeId;

export const isHandlerItem = (
  value: unknown,
): value is Handlers.Item.AnyWithProps =>
  Predicate.hasProperty(value, HandlerItemTypeId);

const HandlerItemProto = {
  [HandlerItemTypeId]: HandlerItemTypeId,
};

const makeHandlerItem = <
  S extends ConfectSchema.ConfectSchema.AnyWithProps,
  Function extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
>({
  function_,
  handler,
}: {
  function_: Function;
  handler: ConfectApiFunctionHandler.Handler<S, Function>;
}): Handlers.Item<S, Function> =>
  Object.assign(Object.create(HandlerItemProto), { function_, handler });

export declare namespace Handlers {
  export interface Any {
    readonly [HandlersTypeId]: {
      _Functions: Types.Covariant<ConfectApiFunction.ConfectApiFunction.AnyWithProps>;
    };
  }

  export interface AnyWithProps
    extends Handlers<
      ConfectSchema.ConfectSchema.AnyWithProps,
      ConfectApiFunction.ConfectApiFunction.AnyWithProps
    > {}

  export interface Item<
    S extends ConfectSchema.ConfectSchema.AnyWithProps,
    Function extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
  > {
    readonly [HandlerItemTypeId]: HandlerItemTypeId;
    readonly function_: Function;
    readonly handler: ConfectApiFunctionHandler.Handler<S, Function>;
  }

  export namespace Item {
    export interface AnyWithProps {
      readonly function_: ConfectApiFunction.ConfectApiFunction.AnyWithProps;
      readonly handler: ConfectApiFunctionHandler.Handler.AnyWithProps;
    }
  }

  export type FromGroup<
    S extends ConfectSchema.ConfectSchema.AnyWithProps,
    Group extends ConfectApiGroup.ConfectApiGroup.Any,
  > = Handlers<S, ConfectApiGroup.ConfectApiGroup.Functions<Group>>;

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

  handle<S extends ConfectSchema.ConfectSchema.AnyWithProps>(
    this: Handlers<S, ConfectApiFunction.ConfectApiFunction.AnyWithProps>,
    name: string,
    handler: ConfectApiFunctionHandler.Handler.AnyWithProps,
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
  S extends ConfectSchema.ConfectSchema.AnyWithProps,
  Functions extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
>({
  group,
  items,
}: {
  readonly group: ConfectApiGroup.ConfectApiGroup.AnyWithProps;
  readonly items: ReadonlyArray<Handlers.Item<S, Functions>>;
}): Handlers<S, Functions> =>
  Object.assign(Object.create(HandlersProto), { group, items });

export const group = <
  S extends ConfectSchema.ConfectSchema.AnyWithProps,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
  const GroupPath extends ConfectApiGroup.Path.All<Groups>,
  Return extends Handlers.AnyWithProps,
>(
  api: ConfectApi.ConfectApi<S, Groups>,
  groupPath: GroupPath,
  build: (
    handlers: Handlers.FromGroup<
      S,
      ConfectApiGroup.Path.GroupAt<Groups, GroupPath>
    >,
  ) => Handlers.ValidateReturn<Return>,
): Layer.Layer<
  ConfectApiGroupService<GroupPath>,
  never,
  ConfectApiGroupService.FromGroupWithPath<GroupPath, Groups>
> => {
  const groupPathParts = String.split(groupPath, ".");
  const [firstGroupPathPart, ...restGroupPathParts] = groupPathParts;

  // TODO: Move this implementation to a module for handling paths/group paths?
  const group = Array.reduce(
    restGroupPathParts,
    api.spec.groups[firstGroupPathPart as keyof typeof api.spec.groups]!,
    (currentGroup, groupPathPart) =>
      currentGroup.groups[groupPathPart as keyof typeof currentGroup.groups]!,
  );

  const items = Array.empty();

  return Layer.effect(
    ConfectApiGroupService<GroupPath>({
      groupPath,
    }),
    Effect.gen(function* () {
      const registry = yield* ConfectApiRegistry.ConfectApiRegistry;

      const handlers = build(
        makeHandlers({ group, items }),
      ) as Handlers.AnyWithProps;

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

export const api = <
  S extends ConfectSchema.ConfectSchema.AnyWithProps,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
>(
  api: ConfectApi.ConfectApi<S, Groups>,
): Layer.Layer<
  ConfectApiService,
  never,
  ConfectApiGroupService.FromGroups<Groups>
> =>
  Layer.effect(
    ConfectApiService,
    Effect.map(Effect.context(), (context) => ({
      api,
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
    `@rjdellecese/confect/ConfectApiGroupService/${groupPath}`,
  );

export declare namespace ConfectApiGroupService {
  export type FromGroups<
    Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
  > = Groups extends never ? never : ConfectApiGroupService<Groups["name"]>;

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
  "@rjdellecese/confect/ConfectApiService",
)<
  ConfectApiService,
  {
    readonly api: ConfectApi.ConfectApi.AnyWithProps;
    readonly context: Context.Context<never>;
  }
>() {}
