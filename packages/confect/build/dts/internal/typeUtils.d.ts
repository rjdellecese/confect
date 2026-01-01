import { Brand } from "effect";
import { DocumentByName, FieldTypeFromFieldPath, GenericDataModel, GenericDatabaseReader, TableNamesInDataModel } from "convex/server";
import { GenericId } from "convex/values";

//#region src/internal/typeUtils.d.ts
type IsOptional<T, K$1 extends keyof T> = {} extends Pick<T, K$1> ? true : false;
type IsAny<T> = 0 extends 1 & T ? true : false;
type IsUnion<T, U$1 extends T = T> = T extends unknown ? [U$1] extends [T] ? false : true : never;
type IsValueLiteral<Vl> = [Vl] extends [never] ? never : [Vl] extends [string | number | bigint | boolean] ? [string] extends [Vl] ? false : [number] extends [Vl] ? false : [boolean] extends [Vl] ? false : [bigint] extends [Vl] ? false : true : false;
/**
 * Assumes record type with string keys.
 */
type IsRecordType<T> = [T] extends [never] ? false : IsUnion<T> extends true ? false : T extends Record<string, infer V> ? string extends keyof T ? keyof T extends string ? T extends Record<string, V> ? Record<string, V> extends T ? true : false : false : false : false : false;
type DeepMutable<T> = IsAny<T> extends true ? any : T extends Brand.Brand<any> | GenericId<any> ? T : T extends ReadonlyMap<infer K, infer V> ? Map<DeepMutable<K>, DeepMutable<V>> : T extends ReadonlySet<infer V> ? Set<DeepMutable<V>> : [keyof T] extends [never] ? T : { -readonly [K in keyof T]: DeepMutable<T[K]> };
type DeepReadonly<T> = IsAny<T> extends true ? any : T extends Map<infer K, infer V> ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>> : T extends Set<infer V> ? ReadonlySet<DeepReadonly<V>> : [keyof T] extends [never] ? T : { readonly [K in keyof T]: DeepReadonly<T[K]> };
type TypeError<Message extends string, T = never> = [Message, T];
type TypeDefect<Message extends string, T = never> = TypeError<`Unexpected type error:\n  ${Message}`, T>;
type IsRecursive<T> = true extends DetectCycle<T> ? true : false;
type DetectCycle<T, Cache extends any[] = []> = IsAny<T> extends true ? false : [T] extends [any] ? T extends Cache[number] ? true : T extends Array<infer U> ? DetectCycle<U, [...Cache, T]> : T extends Map<infer _U, infer V> ? DetectCycle<V, [...Cache, T]> : T extends Set<infer U> ? DetectCycle<U, [...Cache, T]> : T extends object ? true extends { [K in keyof T]: DetectCycle<T[K], [...Cache, T]> }[keyof T] ? true : false : false : never;
type UnionToTuple<t> = _unionToTuple<t, []> extends infer result ? conform<result, t[]> : never;
type _unionToTuple<t, result$1 extends unknown[]> = getLastBranch<t> extends infer current ? [t] extends [never] ? result$1 : _unionToTuple<Exclude<t, current>, [current, ...result$1]> : never;
type getLastBranch<t> = intersectUnion<t extends unknown ? (x: t) => void : never> extends ((x: infer branch) => void) ? branch : never;
type intersectUnion<t> = (t extends unknown ? (_: t) => void : never) extends ((_: infer intersection) => void) ? intersection : never;
type conform<t, base> = t extends base ? t : base;
type IndexFieldTypesForEq<ConvexDataModel extends GenericDataModel, Table extends TableNamesInDataModel<ConvexDataModel>, T extends string[]> = T extends readonly [...infer Rest, any] ? Rest extends readonly string[] ? { [K in keyof Rest]: FieldTypeFromFieldPath<DocumentByName<ConvexDataModel, Table>, Rest[K]> } : never : never;
type BaseDatabaseReader<DataModel extends GenericDataModel> = {
  get: GenericDatabaseReader<DataModel>["get"];
  query: GenericDatabaseReader<DataModel>["query"];
};
//#endregion
export { BaseDatabaseReader, DeepMutable, DeepReadonly, IndexFieldTypesForEq, IsAny, IsOptional, IsRecordType, IsRecursive, IsUnion, IsValueLiteral, TypeDefect, TypeError, UnionToTuple };
//# sourceMappingURL=typeUtils.d.ts.map