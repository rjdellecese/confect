import type { Types } from "effect";
import { pipe, Record } from "effect";
import type * as FunctionSpec from "./FunctionSpec";
import type * as GroupSpec from "./GroupSpec";
import * as Ref from "./Ref";
import type * as Spec from "./Spec";

export type Refs<
  Spec_ extends Spec.AnyWithProps,
  Predicate extends Ref.Any = Ref.Any,
> = Types.Simplify<Helper<Spec.Groups<Spec_>, Predicate>>;

type GroupRefs<
  Group extends GroupSpec.AnyWithProps,
  Predicate extends Ref.Any,
> = Types.Simplify<
  Helper<GroupSpec.Groups<Group>, Predicate> &
    FilteredFunctions<GroupSpec.Functions<Group>, Predicate>
>;

type FilteredFunctions<
  Functions extends FunctionSpec.AnyWithProps,
  Predicate extends Ref.Any,
> = {
  [Name in FunctionSpec.Name<Functions> as FunctionSpec.WithName<
    Functions,
    Name
  > extends infer F extends FunctionSpec.AnyWithProps
    ? Ref.FromFunctionSpec<F> extends Predicate
      ? Name
      : never
    : never]: FunctionSpec.WithName<Functions, Name> extends infer F extends
    FunctionSpec.AnyWithProps
    ? Ref.FromFunctionSpec<F>
    : never;
};

type Helper<
  Groups extends GroupSpec.AnyWithProps,
  Predicate extends Ref.Any,
> = {
  [GroupName in GroupSpec.Name<Groups> as GroupSpec.WithName<
    Groups,
    GroupName
  > extends infer Group extends GroupSpec.AnyWithProps
    ? GroupRefs<Group, Predicate> extends Record<string, never>
      ? never
      : GroupName
    : never]: GroupSpec.WithName<Groups, GroupName> extends infer Group extends
    GroupSpec.AnyWithProps
    ? GroupRefs<Group, Predicate>
    : never;
};

type Any =
  | {
      readonly [key: string]: Any;
    }
  | Ref.Any;

export const make = <Spec_ extends Spec.AnyWithProps>(
  spec: Spec_,
): {
  all: Refs<Spec_>;
  public: Refs<Spec_, Ref.AnyPublic>;
  internal: Refs<Spec_, Ref.AnyInternal>;
} => {
  const refs = makeHelper(spec.groups);
  return {
    all: refs as Refs<Spec_>,
    public: refs as Refs<Spec_, Ref.AnyPublic>,
    internal: refs as Refs<Spec_, Ref.AnyInternal>,
  };
};

const makeHelper = (
  groups: Record.ReadonlyRecord<string, GroupSpec.Any>,
  groupPath: string | null = null,
): Any =>
  pipe(
    groups as Record.ReadonlyRecord<string, GroupSpec.AnyWithProps>,
    Record.map((group) => {
      const currentGroupPath = groupPath
        ? `${groupPath}/${group.name}`
        : group.name;

      return Record.union(
        makeHelper(group.groups, currentGroupPath),
        Record.map(group.functions, (function_) =>
          Ref.make(`${currentGroupPath}:${function_.name}`, function_),
        ),
        (_subGroup, _function) => {
          throw new Error(
            `Group and function at same level have same name ('${Ref.getConvexFunctionName(_function)}')`,
          );
        },
      );
    }),
  );
