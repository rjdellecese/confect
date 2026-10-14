import type {
  DocumentByName,
  FieldTypeFromFieldPath,
  GenericDatabaseReader,
  GenericDataModel,
  TableNamesInDataModel,
} from "convex/server";
import type { GenericId } from "convex/values";
import type { Brand } from "effect";

export type IsOptional<T, K extends keyof T> =
  {} extends Pick<T, K> ? true : false;

export type IsAny<T> = 0 extends 1 & T ? true : false;

export type IsUnion<T, U extends T = T> = T extends unknown
  ? [U] extends [T]
    ? false
    : true
  : never;

// https://stackoverflow.com/a/52806744
export type IsValueLiteral<Vl> = [Vl] extends [never]
  ? never
  : IsUnion<Vl> extends true
    ? false
    : [Vl] extends [string | number | bigint | boolean]
      ? [string] extends [Vl]
        ? false
        : [number] extends [Vl]
          ? false
          : [boolean] extends [Vl]
            ? false
            : [bigint] extends [Vl]
              ? false
              : true
      : false;

/**
 * Only checks for records with string keys.
 */
export type IsRecord<T> = [T] extends [never]
  ? false
  : IsUnion<T> extends true
    ? false
    : T extends Record<string, infer V>
      ? string extends keyof T
        ? keyof T extends string
          ? T extends Record<string, V>
            ? Record<string, V> extends T
              ? true
              : false
            : false
          : false
        : false
      : false;

export type DeepMutable<T> =
  IsAny<T> extends true
    ? any
    : T extends NonRecursiveLeaf
      ? T
      : T extends ReadonlyMap<infer K, infer V>
        ? Map<DeepMutable<K>, DeepMutable<V>>
        : T extends ReadonlySet<infer V>
          ? Set<DeepMutable<V>>
          : [keyof T] extends [never]
            ? T
            : {
                -readonly [K in keyof T]: IsOptional<T, K> extends true
                  ? DeepMutable<Exclude<T[K], undefined>>
                  : DeepMutable<T[K]>;
              };

export interface TypeError<Message extends string, T = never> {
  readonly "~@confect/core/Types/TypeError": Message;
  readonly "~value"?: T;
}

export interface TypeDefect<Message extends string, T = never> {
  readonly "~@confect/core/Types/TypeDefect": Message;
  readonly "~value"?: T;
}

export type IsRecursive<T> = true extends DetectCycle<T> ? true : false;

type NonRecursiveLeaf = Brand.Brand<any> | GenericId<any> | ArrayBuffer;

type IsSame<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
    ? true
    : false;

type IsObject<T> = T extends object ? true : false;

/**
 * Whether `T` is one of the types already on the path, compared by identity.
 * Assignability is not enough: a nested struct is assignable to an ancestor
 * whenever the ancestor's extra fields are optional, and two structs whose
 * fields are all optional can be assignable to each other in both directions.
 * `DetectCycle` asks only once `T` is assignable to some type on the path,
 * which keeps the identity comparisons off the common, non-recursive case.
 */
type IsAncestor<T, Ancestors> = Ancestors extends unknown
  ? IsSame<T, Ancestors>
  : never;

type DetectCycle<T, Ancestors = never> =
  IsAny<T> extends true
    ? false
    : [T] extends [any]
      ? T extends NonRecursiveLeaf
        ? false
        : IsObject<T> extends false
          ? false
          : (
                T extends Ancestors
                  ? true extends IsAncestor<T, Ancestors>
                    ? true
                    : false
                  : false
              ) extends true
            ? true
            : T extends Array<infer U>
              ? DetectCycle<U, Ancestors | T>
              : T extends Map<infer _U, infer V>
                ? DetectCycle<V, Ancestors | T>
                : T extends Set<infer U>
                  ? DetectCycle<U, Ancestors | T>
                  : T extends object
                    ? true extends {
                        [K in keyof T]: DetectCycle<T[K], Ancestors | T>;
                      }[keyof T]
                      ? true
                      : false
                    : false
      : never;

//////////////////////////////////
// START: Vendored from Arktype //
//////////////////////////////////

// https://github.com/arktypeio/arktype/blob/2e911d01a741ccee7a17e31ee144049817fabbb8/ark/util/unionToTuple.ts#L9

export type UnionToTuple<t> =
  _unionToTuple<t, []> extends infer result ? conform<result, t[]> : never;

type _unionToTuple<t, result extends unknown[]> =
  getLastBranch<t> extends infer current
    ? [t] extends [never]
      ? result
      : _unionToTuple<Exclude<t, current>, [current, ...result]>
    : never;

type getLastBranch<t> =
  intersectUnion<t extends unknown ? (x: t) => void : never> extends (
    x: infer branch,
  ) => void
    ? branch
    : never;

type intersectUnion<t> = (t extends unknown ? (_: t) => void : never) extends (
  _: infer intersection,
) => void
  ? intersection
  : never;

type conform<t, base> = t extends base ? t : base;

////////////////////////////////
// END: Vendored from Arktype //
////////////////////////////////

export type IndexFieldTypesForEq<
  ConvexDataModel extends GenericDataModel,
  Table extends TableNamesInDataModel<ConvexDataModel>,
  T extends string[],
> = T extends readonly [...infer Rest, any]
  ? Rest extends readonly string[]
    ? {
        [K in keyof Rest]: FieldTypeFromFieldPath<
          DocumentByName<ConvexDataModel, Table>,
          Rest[K]
        >;
      }
    : never
  : never;

// Would prefer to use `BaseDatabaseReader` from the `convex` package, but it's not exported.
export type BaseDatabaseReader<DataModel extends GenericDataModel> = {
  get: GenericDatabaseReader<DataModel>["get"];
  query: GenericDatabaseReader<DataModel>["query"];
};
