import { Predicate, Record } from "effect";
import * as ConfectApiGroup from "./ConfectApiGroup";

export const TypeId = Symbol.for("@rjdellecese/confect/ConfectApi");

export type TypeId = typeof TypeId;

export const isConfectApi = (u: unknown): u is ConfectApi.Any =>
  Predicate.hasProperty(u, TypeId);

export interface ConfectApi<
  Groups extends ConfectApiGroup.ConfectApiGroup.Any = never,
> {
  readonly [TypeId]: TypeId;
  readonly groups: Record.ReadonlyRecord<string, Groups>;

  add<Group extends ConfectApiGroup.ConfectApiGroup.Any>(
    group: Group,
  ): ConfectApi<Groups | Group>;
}

export declare namespace ConfectApi {
  export interface Any {
    readonly [TypeId]: TypeId;
  }

  export interface AnyWithProps
    extends ConfectApi<ConfectApiGroup.ConfectApiGroup.AnyWithProps> {}
}

const Proto = {
  [TypeId]: TypeId,

  add<Group extends ConfectApiGroup.ConfectApiGroup.AnyWithProps>(
    this: ConfectApi.AnyWithProps,
    group: Group,
  ) {
    return makeProto({
      groups: Record.set(this.groups, group.name, group),
    });
  },
};

const makeProto = <Groups extends ConfectApiGroup.ConfectApiGroup.Any>({
  groups,
}: {
  groups: Record.ReadonlyRecord<string, Groups>;
}): ConfectApi<Groups> => Object.assign(Object.create(Proto), { groups });

export const make = (): ConfectApi => makeProto({ groups: Record.empty() });
