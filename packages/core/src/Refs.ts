import type { Types } from "effect";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import * as Record from "effect/Record";
import * as Result from "effect/Result";
import type * as FunctionSpec from "./FunctionSpec";
import type * as GroupSpec from "./GroupSpec";
import type * as MiddlewareSpec from "./MiddlewareSpec";
import * as Ref from "./Ref";
import * as Spec from "./Spec";

export type Refs<
  Spec_ extends Spec.AnyWithProps,
  Predicate extends Ref.Any = Ref.Any,
> = Types.Simplify<OmitEmpty<RootHelper<Spec.Groups<Spec_>, Predicate>>>;

export interface FromSpec<Spec_ extends Spec.AnyWithProps> {
  public: Refs<Spec_, Ref.AnyPublic>;
  internal: Refs<Spec_, Ref.AnyInternal>;
}

type GroupRefs<
  Group extends GroupSpec.AnyWithProps,
  Predicate extends Ref.Any,
> = Types.Simplify<
  OmitEmpty<Helper<GroupSpec.Groups<Group>, Predicate>> &
    FilteredFunctions<
      GroupSpec.Functions<Group>,
      Predicate,
      MiddlewareSpec.Error<GroupSpec.MiddlewareSpecs<Group>>
    >
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
    any,
    any
  > extends Predicate
    ? true
    : false;

type FilteredFunctions<
  FunctionSpecs extends FunctionSpec.AnyWithProps,
  Predicate extends Ref.Any,
  MiddlewareError,
> = {
  [
    Name in FunctionSpec.Name<FunctionSpecs> as FunctionSpec.WithName<
      FunctionSpecs,
      Name
    > extends infer FunctionSpec_ extends FunctionSpec.AnyWithProps
      ? FunctionSpecMatchesPredicate<FunctionSpec_, Predicate> extends true
        ? Name
        : never
      : never
  ]: FunctionSpec.WithName<FunctionSpecs, Name> extends infer F extends
    FunctionSpec.AnyWithProps
    ? Ref.FromFunctionSpec<
        F,
        F extends {
          readonly functionProvenance: { readonly _tag: "Confect" };
        }
          ?
              | MiddlewareError
              | MiddlewareSpec.Error<FunctionSpec.MiddlewareSpecs<F>>
          : never
      >
    : never;
};

type RootHelper<
  Groups extends GroupSpec.AnyWithProps,
  Predicate extends Ref.Any,
> = Helper<Exclude<Groups, { readonly root: true }>, Predicate> &
  ([Extract<Groups, { readonly root: true }>] extends [never]
    ? {}
    : GroupRefs<Extract<Groups, { readonly root: true }>, Predicate>);

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
): FromSpec<Spec_> => {
  const validation = Spec.validateGroups(Spec.groups(spec));
  if (Result.isFailure(validation)) {
    throw Spec.InvalidRootGroups.make({ issue: validation.failure });
  }
  const refs = makeHelper(Spec.groups(spec));
  return {
    public: refs as Refs<Spec_, Ref.AnyPublic>,
    internal: refs as Refs<Spec_, Ref.AnyInternal>,
  };
};

const makeHelper = (
  groups: Record.ReadonlyRecord<string, GroupSpec.AnyWithProps>,
  convexFunctionNamespace: Option.Option<string> = Option.none(),
): Any =>
  Record.fromEntries(
    Array.flatMap(
      Record.toEntries(groups),
      ([name, group]): ReadonlyArray<readonly [string, Any]> => {
        const currentConvexFunctionNamespace = Option.match(
          convexFunctionNamespace,
          {
            onNone: () => name,
            onSome: (parentNamespace) => `${parentNamespace}/${name}`,
          },
        );

        const refs = Record.union(
          makeHelper(group.groups, Option.some(currentConvexFunctionNamespace)),
          Record.map(group.functions, (function_) =>
            Ref.make(
              currentConvexFunctionNamespace,
              function_,
              group.middlewareAttachments,
            ),
          ),
          (_subGroup, _function) => {
            throw new Error(
              `Group and function at same level have same name ('${Ref.getConvexFunctionName(_function)}')`,
            );
          },
        );
        return group.root ? Record.toEntries(refs) : [[name, refs] as const];
      },
    ),
  );
