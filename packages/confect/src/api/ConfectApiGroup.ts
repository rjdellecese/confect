import { Predicate, Record } from "effect";
import * as ConfectApiQuery from "./ConfectApiQuery";

export const TypeId = Symbol.for("@rjdellecese/confect/ConfectApiGroup");

export type TypeId = typeof TypeId;

export const isConfectApiGroup = (u: unknown): u is ConfectApiGroup.Any =>
  Predicate.hasProperty(u, TypeId);

export interface ConfectApiGroup<
  Name extends string,
  Queries extends ConfectApiQuery.ConfectApiQuery.Any = never,
> {
  readonly [TypeId]: TypeId;
  readonly name: Name;
  readonly queries: Record.ReadonlyRecord<string, Queries>;

  add<Query extends ConfectApiQuery.ConfectApiQuery.AnyWithProps>(
    query: Query,
  ): ConfectApiGroup<Name, Queries | Query>;
}

export declare namespace ConfectApiGroup {
  export interface Any {
    readonly [TypeId]: TypeId;
    readonly name: string;
  }

  export interface AnyWithProps
    extends ConfectApiGroup<
      any,
      ConfectApiQuery.ConfectApiQuery.AnyWithProps
    > {}
}

const Proto = {
  [TypeId]: TypeId,

  add<Query extends ConfectApiQuery.ConfectApiQuery.AnyWithProps>(
    this: ConfectApiGroup.AnyWithProps,
    query: Query,
  ) {
    return makeProto({
      name: this.name,
      queries: Record.set(this.queries, query.name, query),
    });
  },
};

const makeProto = <
  Name extends string,
  Queries extends ConfectApiQuery.ConfectApiQuery.Any,
>({
  name,
  queries,
}: {
  name: Name;
  queries: Record.ReadonlyRecord<string, Queries>;
}): ConfectApiGroup<Name, Queries> =>
  Object.assign(Object.create(Proto), {
    name,
    queries,
  });

export const make = <const Name extends string>({
  name,
}: {
  name: Name;
}): ConfectApiGroup<Name> =>
  makeProto({
    name,
    queries: Record.empty(),
  });
