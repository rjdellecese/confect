import {
  Array,
  Context,
  Effect,
  Function,
  Layer,
  Record,
  Ref,
  String,
  Types,
} from "effect";
import { GenericConfectSchema } from "../server/ConfectSchema";
import * as ConfectApi from "./ConfectApi";
import * as ConfectApiFunction from "./ConfectApiFunction";
import * as ConfectApiGroup from "./ConfectApiGroup";
import * as ConfectApiRegistry from "./ConfectApiRegistry";

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
  export interface Any {
    readonly [HandlersTypeId]: {
      _Functions: Types.Covariant<ConfectApiFunction.ConfectApiFunction.AnyWithProps>;
    };
  }

  export interface AnyWithProps
    extends Handlers<
      GenericConfectSchema,
      ConfectApiFunction.ConfectApiFunction.AnyWithProps
    > {}

  export interface Item<
    ConfectSchema extends GenericConfectSchema,
    Function extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
  > {
    readonly function_: Function;
    readonly handler: ConfectApiFunction.Handler<ConfectSchema, Function>;
  }

  export namespace Item {
    export interface AnyWithProps {
      readonly function_: ConfectApiFunction.ConfectApiFunction.AnyWithProps;
      readonly handler: ConfectApiFunction.Handler.AnyWithProps;
    }
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
  const GroupPath extends ConfectApiGroup.Path.All<Groups>,
  Return extends Handlers.AnyWithProps,
>(
  api: ConfectApi.ConfectApi<ConfectSchema, ApiName, Groups>,
  groupPath: GroupPath,
  build: (
    handlers: Handlers.FromGroup<
      ConfectSchema,
      ConfectApiGroup.Path.GroupAt<Groups, GroupPath>
    >
  ) => Handlers.ValidateReturn<Return>
): Layer.Layer<
  ConfectApiGroupService<ApiName, GroupPath>,
  never,
  ConfectApiGroupService.FromGroupWithPath<ApiName, GroupPath, Groups>
> => {
  const [firstGroupPathPart, ...restGroupPathParts] = String.split(
    groupPath,
    "."
  );

  // TODO: Move this implementation to a module for handling paths/group paths?
  const group = Array.reduce(
    restGroupPathParts,
    api.spec.groups[firstGroupPathPart as keyof typeof api.spec.groups]!,
    (currentGroup, groupPathPart) =>
      currentGroup.groups[groupPathPart as keyof typeof currentGroup.groups]!
  );

  const items = Array.empty();

  const apiName = api.spec.name;

  return Layer.effect(
    ConfectApiGroupService<ApiName, GroupPath>({
      apiName,
      groupPath,
    }),
    Effect.gen(function* () {
      const registry = yield* ConfectApiRegistry.ConfectApiRegistry;

      const handlers = build(
        makeHandlers({ group, items })
      ) as Handlers.AnyWithProps;

      for (const handlerItem of handlers.items) {
        const functionPath = Array.join(
          [groupPath, handlerItem.function_.name],
          "."
        );
        yield* Ref.update(registry, Record.set(functionPath, handlerItem));
      }

      return yield* Effect.succeed({
        apiName,
        groupPath,
      });
    })
  );
};

export const api = <
  ConfectSchema extends GenericConfectSchema,
  const ApiName extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
>(
  api: ConfectApi.ConfectApi<ConfectSchema, ApiName, Groups>
): Layer.Layer<
  ConfectApiService,
  never,
  ConfectApiGroupService.FromGroups<ApiName, Groups>
> =>
  Layer.effect(
    ConfectApiService,
    Effect.map(Effect.context(), (context) => ({
      api,
      context,
    }))
  );

export interface ConfectApiGroupService<
  ApiName extends string,
  GroupPath extends string,
> {
  readonly apiName: ApiName;
  readonly groupPath: GroupPath;
}

export const ConfectApiGroupService = <
  ApiName extends string,
  GroupPath extends string,
>({
  apiName,
  groupPath,
}: {
  apiName: string;
  groupPath: GroupPath;
}) =>
  Context.GenericTag<ConfectApiGroupService<ApiName, GroupPath>>(
    `@rjdellecese/confect/ConfectApiGroupService/${apiName}/${groupPath}`
  );

export declare namespace ConfectApiGroupService {
  export type FromGroups<
    ApiName extends string,
    Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
  > = Groups extends never
    ? never
    : ConfectApiGroupService<ApiName, Groups["name"]>;

  export type FromGroupWithPath<
    ApiName extends string,
    GroupPath extends string,
    Group extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
  > =
    ConfectApiGroup.Path.SubGroupsAt<
      Group,
      GroupPath
    > extends infer SubGroupPaths
      ? SubGroupPaths extends string
        ? ConfectApiGroupService<ApiName, SubGroupPaths>
        : never
      : never;
}

export class ConfectApiService extends Context.Tag(
  "@rjdellecese/confect/ConfectApiService"
)<
  ConfectApiService,
  {
    readonly api: ConfectApi.ConfectApi.AnyWithProps;
    readonly context: Context.Context<never>;
  }
>() {}
