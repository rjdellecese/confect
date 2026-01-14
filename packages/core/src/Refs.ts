import type { Types } from "effect";
import { pipe, Record } from "effect";
import type * as FunctionSpec from "./FunctionSpec";
import type * as GroupSpec from "./GroupSpec";
import * as Ref from "./Ref";
import type * as Spec from "./Spec";

export type Refs<Spec_ extends Spec.AnyWithProps> = Types.Simplify<
  Helper<Spec.Groups<Spec_>>
>;

type Helper<Groups extends GroupSpec.AnyWithProps> = {
  [GroupName in GroupSpec.Name<Groups>]: GroupSpec.WithName<
    Groups,
    GroupName
  > extends infer Group extends GroupSpec.AnyWithProps
    ? GroupSpec.Groups<Group> extends infer SubGroups extends
        GroupSpec.AnyWithProps
      ? Types.Simplify<
          Helper<SubGroups> & {
            [FunctionName in FunctionSpec.Name<
              GroupSpec.Functions<Group>
            >]: FunctionSpec.WithName<
              GroupSpec.Functions<Group>,
              FunctionName
            > extends infer Function extends FunctionSpec.AnyWithProps
              ? Ref.Ref<
                  FunctionSpec.GetFunctionType<Function>,
                  FunctionSpec.GetFunctionVisibility<Function>,
                  FunctionSpec.Args<Function>,
                  FunctionSpec.Returns<Function>
                >
              : never;
          }
        >
      : never
    : never;
};

type FilterRefs<Refs_, Predicate> = Types.Simplify<{
  [K in keyof Refs_ as Refs_[K] extends Predicate
    ? K
    : Refs_[K] extends Ref.Any
      ? never
      : FilterRefs<Refs_[K], Predicate> extends Record<string, never>
        ? never
        : K]: Refs_[K] extends Predicate
    ? Refs_[K]
    : FilterRefs<Refs_[K], Predicate>;
}>;

export const justInternal = <Refs_ extends RefsAnyWithProps>(
  refs: Refs_,
): FilterRefs<Refs_, Ref.AnyInternal> => refs as any;

export const justPublic = <Refs_ extends RefsAnyWithProps>(
  refs: Refs_,
): FilterRefs<Refs_, Ref.AnyPublic> => refs as any;

export type RefsAnyWithProps =
  | {
      readonly [key: string]: RefsAnyWithProps;
    }
  | Ref.Any;

export const make = <Spec_ extends Spec.AnyWithProps>(
  spec: Spec_,
): Refs<Spec_> => makeHelper(spec.groups) as Refs<Spec_>;

const makeHelper = (
  groups: Record.ReadonlyRecord<string, GroupSpec.Any>,
  groupPath: string | null = null,
): RefsAnyWithProps =>
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
