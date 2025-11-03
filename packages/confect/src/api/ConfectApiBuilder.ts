import { Array, Context, Effect, Function, Layer, String, Types } from "effect";
import { GenericConfectSchema } from "../server/schema";
import * as ConfectApiFunction from "./ConfectApiFunction";
import * as ConfectApiGroup from "./ConfectApiGroup";
import * as ConfectApiRegistry from "./ConfectApiRegistry";
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
  const GroupPath extends ConfectApiGroup.ConfectApiGroup.Path<Groups>,
  Return extends Handlers.AnyWithProps,
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

  // TODO: Move this implementation to a module for handling paths/group paths
  const group = Array.reduce(
    restGroupPathParts,
    apiWithDatabaseSchema.api.groups[
      firstGroupPathPart as keyof typeof apiWithDatabaseSchema.api.groups
    ]!,
    (currentGroup, groupPathPart) =>
      currentGroup.groups[groupPathPart as keyof typeof currentGroup.groups]!
  );

  const items = Array.empty();

  return Layer.scopedDiscard(
    Effect.gen(function* () {
      const registry = yield* ConfectApiRegistry.ConfectApiRegistry;

      const handlers = build(
        makeHandlers({ group, items })
      ) as Handlers.AnyWithProps;

      yield* Effect.forEach(handlers.items, (handlerItem) =>
        Effect.gen(function* () {
          const functionPath = Array.join(
            [groupPath, handlerItem.function_.name],
            "."
          );

          return yield* registry.add(functionPath, handlerItem);
        })
      );
    })
  ) as any;
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
  ConfectApiService,
  never,
  ConfectApiGroupService.FromGroups<ConfectSchema, ApiName, Groups>
> =>
  Layer.effect(
    ConfectApiService,
    Effect.map(Effect.context(), (context) => ({
      apiWithDatabaseSchema,
      context,
    }))
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

export class ConfectApiService extends Context.Tag(
  "@rjdellecese/confect/ConfectApiService"
)<
  ConfectApiService,
  {
    readonly apiWithDatabaseSchema: ConfectApiWithDatabaseSchema.ConfectApiWithDatabaseSchema.AnyWithProps;
    readonly context: Context.Context<never>;
  }
>() {}
