import { Chunk, Function, hole, Layer, Types } from "effect";
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
    handler: ConfectApiFunction.ConfectApiFunction.HandlerWithName<
      Functions,
      Name
    >
  ): Handlers<
    ConfectApiFunction.ConfectApiFunction.ExcludeName<Functions, Name>
  >;
}

export declare namespace Handlers {
  export interface Item {
    readonly function_: ConfectApiFunction.ConfectApiFunction.Any;
    readonly handler: ConfectApiFunction.ConfectApiFunction.Handler<any>;
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
    handler: ConfectApiFunction.ConfectApiFunction.Handler<any>
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
  readonly group: ConfectApiGroup.ConfectApiGroup.Any;
  readonly handlers: Chunk.Chunk<Handlers.Item>;
}): Handlers<Functions> =>
  Object.assign(Object.create(HandlersProto), { group, handlers });

export const group = <
  const ApiName extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.Any,
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
): Layer.Layer<ConfectApiGroup.ConfectApiGroupService<ApiName, GroupName>> => {
  const group = api.groups[groupName]!;
  const handlers = Chunk.empty();

  build(
    makeHandlers({
      group,
      handlers,
    })
  );

  return hole();
};

export const api = <
  const ApiName extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.Any,
>(
  api: ConfectApi.ConfectApi<ApiName, Groups>
): Layer.Layer<
  ConfectApi.ConfectApi.ConfectApiService,
  never,
  ConfectApiGroup.ConfectApiGroup.ToService<ApiName, Groups>
> => Layer.succeed(ConfectApi.ConfectApi.ConfectApiService, api as any);
