import type { Types } from "effect";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Record from "effect/Record";
import type * as FunctionSpec from "./FunctionSpec";
import type * as GroupSpec from "./GroupSpec";
import * as Ref from "./Ref";
import type * as Spec from "./Spec";

export type Refs<
  Spec_ extends Spec.AnyWithProps,
  Predicate extends Ref.Any = Ref.Any,
> = Types.Simplify<OmitEmpty<Helper<Spec.Groups<Spec_>, Predicate>>>;

type GroupRefs<
  Group extends GroupSpec.AnyWithProps,
  Predicate extends Ref.Any,
> = Types.Simplify<
  OmitEmpty<Helper<GroupSpec.Groups<Group>, Predicate>> &
    FilteredFunctions<GroupSpec.Functions<Group>, Predicate>
>;

type OmitEmpty<T> = {
  [K in keyof T as keyof T[K] extends never ? never : K]: T[K];
};

type FunctionSpecMatchesPredicate<
  FunctionSpec_ extends FunctionSpec.AnyWithProps,
  Predicate extends Ref.Any,
> =
  Ref.Ref<
    FunctionSpec.GetRuntimeAndFunctionType<FunctionSpec_>,
    FunctionSpec.GetFunctionVisibility<FunctionSpec_>,
    any,
    any
  > extends Predicate
    ? true
    : false;

type FilteredFunctions<
  FunctionSpecs extends FunctionSpec.AnyWithProps,
  Predicate extends Ref.Any,
> = {
  [Name in FunctionSpec.Name<FunctionSpecs> as FunctionSpec.WithName<
    FunctionSpecs,
    Name
  > extends infer FunctionSpec_ extends FunctionSpec.AnyWithProps
    ? FunctionSpecMatchesPredicate<FunctionSpec_, Predicate> extends true
      ? Name
      : never
    : never]: FunctionSpec.WithName<FunctionSpecs, Name> extends infer F extends
    FunctionSpec.AnyWithProps
    ? Ref.FromFunctionSpec<F>
    : never;
};

type Helper<
  Groups extends GroupSpec.AnyWithProps,
  Predicate extends Ref.Any,
> = {
  [GroupName in GroupSpec.Name<Groups>]: GroupSpec.WithName<
    Groups,
    GroupName
  > extends infer Group extends GroupSpec.AnyWithProps
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
  public: Refs<Spec_, Ref.AnyPublic>;
  internal: Refs<Spec_, Ref.AnyInternal>;
} => {
  const refs = makeHelper(spec.groups);
  return {
    public: refs as Refs<Spec_, Ref.AnyPublic>,
    internal: refs as Refs<Spec_, Ref.AnyInternal>,
  };
};

const makeHelper = (
  groups: Record.ReadonlyRecord<string, GroupSpec.Any>,
  functionNamespace: Option.Option<string> = Option.none(),
): Any =>
  pipe(
    groups as Record.ReadonlyRecord<string, GroupSpec.AnyWithProps>,
    Record.map((group, name) => {
      const currentFunctionNamespace = Option.match(functionNamespace, {
        onNone: () => name,
        onSome: (parentNamespace) => `${parentNamespace}/${name}`,
      });

      return Record.union(
        makeHelper(group.groups, Option.some(currentFunctionNamespace)),
        Record.map(group.functions, (function_) =>
          Ref.make(currentFunctionNamespace, function_),
        ),
        (_subGroup, _function) => {
          throw new Error(
            `Group and function at same level have same name ('${Ref.getConvexFunctionName(_function)}')`,
          );
        },
      );
    }),
  );
